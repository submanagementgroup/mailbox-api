import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface MailboxDbStackProps extends cdk.StackProps {
  targetEnvironment: 'dev' | 'prod';
}

export class MailboxDbStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly redisCluster: elasticache.CfnCacheCluster;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: MailboxDbStackProps) {
    super(scope, id, props);

    const isProd = props.targetEnvironment === 'prod';

    // ============================================
    // VPC LOOKUP (Import existing VPC)
    // ============================================
    // Use Control Tower created VPC (first non-default VPC)
    this.vpc = ec2.Vpc.fromLookup(this, 'ExistingVPC', {
      isDefault: false,
    });

    // ============================================
    // SECURITY GROUPS
    // ============================================

    // Database security group
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSG', {
      vpc: this.vpc,
      description: 'Security group for Aurora database',
      allowAllOutbound: false,
    });

    // Redis security group
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSG', {
      vpc: this.vpc,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: false,
    });

    // Lambda security group (for functions that need VPC access)
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: this.vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    // Allow Lambda to access Aurora
    this.dbSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow Lambda to Aurora'
    );

    // Allow Lambda to access Redis
    this.redisSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Lambda to Redis'
    );

    // ============================================
    // DATABASE CREDENTIALS
    // ============================================
    this.dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: `${props.targetEnvironment}/mail-platform/db`,
      description: 'Aurora database credentials for mail platform',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: 'mailadmin',
        }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // ============================================
    // KMS KEY FOR DATABASE ENCRYPTION
    // ============================================
    const dbKmsKey = new kms.Key(this, 'DatabaseEncryptionKey', {
      enableKeyRotation: true,
      description: `KMS key for ${props.targetEnvironment} mail platform database encryption`,
      alias: `alias/${props.targetEnvironment}-mail-db-key`,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ============================================
    // RDS ENHANCED MONITORING ROLE
    // ============================================
    const rdsMonitoringRole = new iam.Role(this, 'RDSMonitoringRole', {
      assumedBy: new iam.ServicePrincipal('monitoring.rds.amazonaws.com'),
      description: `Enhanced monitoring role for ${props.targetEnvironment} mail database`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonRDSEnhancedMonitoringRole'),
      ],
    });

    // ============================================
    // AURORA SERVERLESS V2
    // ============================================
    this.dbCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_08_0, // MySQL 8.0.39 compatible (Portal uses this)
      }),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      defaultDatabaseName: 'email_platform',
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],
      serverlessV2MinCapacity: isProd ? 1 : 0.5,  // Dev: 0.5 ACU min, Prod: 1 ACU min
      serverlessV2MaxCapacity: isProd ? 4 : 1,    // Dev: 1 ACU max, Prod: 4 ACU max
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        // instanceIdentifier removed - CDK auto-generates (allows CloudFormation to replace)
        publiclyAccessible: false,
        enablePerformanceInsights: true, // FIXED: Enable in all environments (was backwards)
        performanceInsightRetention: isProd
          ? rds.PerformanceInsightRetention.MONTHS_12
          : rds.PerformanceInsightRetention.DEFAULT,
      }),
      readers: isProd ? [
        rds.ClusterInstance.serverlessV2('Reader', {
          // instanceIdentifier removed - CDK auto-generates (allows CloudFormation to replace)
          publiclyAccessible: false,
          enablePerformanceInsights: true,
          performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
        }),
      ] : [],
      monitoringInterval: cdk.Duration.seconds(60), // Required by NIST CT.RDS.PR.2
      monitoringRole: rdsMonitoringRole, // Explicit role for enhanced monitoring
      backup: {
        retention: isProd ? cdk.Duration.days(30) : cdk.Duration.days(7),
        preferredWindow: '08:00-09:00', // 3-4 AM Toronto (EST = UTC-5)
      },
      preferredMaintenanceWindow: 'sun:09:00-sun:10:00', // 4-5 AM Toronto on Sunday (EST = UTC-5)
      cloudwatchLogsExports: ['error', 'general', 'slowquery'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      storageEncrypted: true, // Required by NIST CT.RDS.PR.16
      storageEncryptionKey: dbKmsKey, // Customer-managed KMS key with rotation
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // ============================================
    // ELASTICACHE REDIS
    // ============================================

    // Redis subnet group
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Redis session cache',
      subnetIds: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      }).subnetIds,
      cacheSubnetGroupName: `${props.targetEnvironment}-mail-redis-subnet-group`,
    });

    // Redis cluster
    this.redisCluster = new elasticache.CfnCacheCluster(this, 'RedisCluster', {
      cacheNodeType: isProd ? 'cache.t3.small' : 'cache.t3.micro',
      engine: 'redis',
      numCacheNodes: 1,
      engineVersion: '7.0',
      vpcSecurityGroupIds: [this.redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
      clusterName: `${props.targetEnvironment}-mail-redis`,
      preferredMaintenanceWindow: 'sun:05:00-sun:06:00',
      snapshotRetentionLimit: isProd ? 7 : 1,
      autoMinorVersionUpgrade: true,
    });
    this.redisCluster.addDependency(redisSubnetGroup);

    // ============================================
    // OUTPUTS (DEPRECATED - will be removed after deployment)
    // ============================================
    // These outputs are deprecated in favor of direct object passing.
    // All resources are now passed directly via props (vpc, dbCluster, dbSecret, redisCluster, lambdaSecurityGroup).
    // Use dbStack.vpc, dbStack.dbCluster, etc. for cross-stack references.
    // Keeping temporarily for deployment safety, will remove after verification.

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: '[DEPRECATED] Aurora database cluster endpoint - use dbStack.dbCluster.clusterEndpoint.hostname instead',
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'email_platform',
      description: '[DEPRECATED] Database name - hardcoded value, informational only',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: '[DEPRECATED] ARN of database credentials secret - use dbStack.dbSecret.secretArn instead',
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisCluster.attrRedisEndpointAddress,
      description: '[DEPRECATED] Redis endpoint address - use dbStack.redisCluster.attrRedisEndpointAddress instead',
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisCluster.attrRedisEndpointPort,
      description: '[DEPRECATED] Redis endpoint port - use dbStack.redisCluster.attrRedisEndpointPort instead',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: '[DEPRECATED] Security group ID for Lambda functions - use dbStack.lambdaSecurityGroup.securityGroupId instead',
    });
  }
}
