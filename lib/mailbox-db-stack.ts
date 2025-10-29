import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';

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
    // AURORA SERVERLESS V2
    // ============================================
    this.dbCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_05_2,
      }),
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        instanceIdentifier: `${props.targetEnvironment}-mail-writer`,
        publiclyAccessible: false,
      }),
      readers: isProd ? [
        rds.ClusterInstance.serverlessV2('Reader', {
          instanceIdentifier: `${props.targetEnvironment}-mail-reader`,
          publiclyAccessible: false,
        }),
      ] : [],
      serverlessV2MinCapacity: isProd ? 1 : 0.5,
      serverlessV2MaxCapacity: isProd ? 4 : 1,
      vpc: this.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [this.dbSecurityGroup],
      defaultDatabaseName: 'email_platform',
      backup: {
        retention: cdk.Duration.days(isProd ? 30 : 7),
        preferredWindow: '03:00-04:00',
      },
      cloudwatchLogsExports: ['error', 'general', 'slowquery'],
      cloudwatchLogsRetention: logs.RetentionDays.ONE_MONTH,
      storageEncrypted: true, // Required by NIST controls
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
    // OUTPUTS
    // ============================================
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Aurora database cluster endpoint',
      exportName: `${props.targetEnvironment}-mail-db-endpoint`,
    });

    new cdk.CfnOutput(this, 'DatabaseName', {
      value: 'email_platform',
      description: 'Database name',
      exportName: `${props.targetEnvironment}-mail-db-name`,
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.dbSecret.secretArn,
      description: 'ARN of database credentials secret',
      exportName: `${props.targetEnvironment}-mail-db-secret-arn`,
    });

    new cdk.CfnOutput(this, 'RedisEndpoint', {
      value: this.redisCluster.attrRedisEndpointAddress,
      description: 'Redis endpoint address',
      exportName: `${props.targetEnvironment}-mail-redis-endpoint`,
    });

    new cdk.CfnOutput(this, 'RedisPort', {
      value: this.redisCluster.attrRedisEndpointPort,
      description: 'Redis endpoint port',
      exportName: `${props.targetEnvironment}-mail-redis-port`,
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security group ID for Lambda functions',
      exportName: `${props.targetEnvironment}-mail-lambda-sg-id`,
    });
  }
}
