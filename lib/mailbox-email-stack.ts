import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface MailboxEmailStackProps extends cdk.StackProps {
  targetEnvironment: 'dev' | 'prod';
  mailDomain: string;
  vpc: ec2.IVpc;
  dbCluster: rds.DatabaseCluster;
  dbSecret: secretsmanager.ISecret;
  lambdaSecurityGroup: ec2.ISecurityGroup;
}

export class MailboxEmailStack extends cdk.Stack {
  public readonly emailBucket: s3.Bucket;
  public readonly emailProcessorFunction: lambda.Function;
  public readonly sesIdentity: ses.EmailIdentity;

  constructor(scope: Construct, id: string, props: MailboxEmailStackProps) {
    super(scope, id, props);

    const isProd = props.targetEnvironment === 'prod';

    // ============================================
    // S3 BUCKET FOR RECEIVED EMAILS
    // ============================================
    this.emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `${props.targetEnvironment}-mailbox-emails-${cdk.Aws.ACCOUNT_ID}`,
      versioned: true, // Required by NIST
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true, // Required by NIST CT.S3.PR.1
      lifecycleRules: [
        {
          // Delete raw emails after 90 days (we have parsed data in Aurora)
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(7),
          id: 'DeleteOldEmails',
        },
      ],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // ============================================
    // SES DOMAIN IDENTITY
    // ============================================
    this.sesIdentity = new ses.EmailIdentity(this, 'SESIdentity', {
      identity: ses.Identity.domain(props.mailDomain),
      dkimSigning: true,
    });

    // ============================================
    // EMAIL PROCESSOR LAMBDA FUNCTION
    // ============================================
    this.emailProcessorFunction = new lambda.Function(this, 'EmailProcessor', {
      functionName: `${props.targetEnvironment}-mailbox-email-processor`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
// Placeholder Lambda function for email processing
// Will be replaced with actual implementation in future commits
exports.handler = async (event) => {
  console.log('Email received:', JSON.stringify(event, null, 2));

  // Process S3 event
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, ' '));

    console.log('Processing email from S3:', { bucket, key });

    // TODO: Implement actual email processing:
    // 1. Download email from S3
    // 2. Parse email using mailparser
    // 3. Check sender domain against whitelisted_senders table
    // 4. Store parsed email in email_messages table
    // 5. Check forwarding rules (user_forwarding_rules + system_forwarding_rules)
    // 6. Validate forwarding recipients against whitelisted_recipients
    // 7. Forward email via SES
    // 8. Log action in audit_log
  }

  return { statusCode: 200, body: 'Email processing initiated' };
};
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        EMAIL_BUCKET: this.emailBucket.bucketName,
        DB_HOST: props.dbCluster.clusterEndpoint.hostname,
        DB_NAME: 'email_platform',
        DB_SECRET_ARN: props.dbSecret.secretArn,
        ENVIRONMENT: props.targetEnvironment,
      },
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      logRetention: logs.RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE, // X-Ray distributed tracing
      architecture: lambda.Architecture.ARM_64, // Cost savings (~20% cheaper)
    });

    // Grant Lambda access to S3 bucket
    this.emailBucket.grantRead(this.emailProcessorFunction);

    // Grant Lambda access to database secret
    props.dbSecret.grantRead(this.emailProcessorFunction);

    // Grant Lambda permission to send emails via SES
    this.emailProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:SendEmail',
          'ses:SendRawEmail',
        ],
        resources: ['*'], // SES doesn't support resource-level permissions for sending
      })
    );

    // ============================================
    // S3 EVENT NOTIFICATION → LAMBDA
    // ============================================
    this.emailBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.emailProcessorFunction),
      {
        prefix: 'incoming/',
        suffix: '.eml',
      }
    );

    // ============================================
    // SES RECEIPT RULE SET (Custom Resource)
    // ============================================
    // Grant SES permission to write to S3 bucket
    this.emailBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${this.emailBucket.bucketArn}/incoming/*`],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Aws.ACCOUNT_ID,
          },
        },
      })
    );

    // IAM Role for Custom Resource Lambda
    const customResourceRole = new iam.Role(this, 'SESReceiptRuleCustomResourceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant SES permissions to the custom resource
    customResourceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ses:CreateReceiptRule',
          'ses:UpdateReceiptRule',
          'ses:DeleteReceiptRule',
          'ses:DescribeReceiptRule',
          'ses:DescribeReceiptRuleSet',
        ],
        resources: ['*'], // SES doesn't support resource-level permissions for receipt rules
      })
    );

    // Custom Resource Lambda Function
    const customResourceFunction = new lambda.Function(this, 'SESReceiptRuleCustomResource', {
      functionName: `${props.targetEnvironment}-ses-receipt-rule-cr`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/ses-receipt-rule-cr'),
      timeout: cdk.Duration.seconds(60), // Allow time for CloudFormation response
      memorySize: 256,
      role: customResourceRole,
      logRetention: logs.RetentionDays.ONE_WEEK,
      architecture: lambda.Architecture.ARM_64,
    });

    // Create Custom Resource to manage SES receipt rule
    const sesReceiptRule = new cdk.CustomResource(this, 'SESReceiptRule', {
      serviceToken: customResourceFunction.functionArn,
      properties: {
        RuleSetName: 'default-rule-set',
        RuleName: `${props.targetEnvironment}-mailbox-rule`,
        Recipients: [props.mailDomain],
        S3BucketName: this.emailBucket.bucketName,
        S3ObjectKeyPrefix: 'incoming/',
        TlsPolicy: 'Require',
        Enabled: true,
      },
    });

    // ============================================
    // OUTPUTS (DEPRECATED - will be removed after deployment)
    // ============================================
    // These outputs are deprecated in favor of direct object passing.
    // The emailBucket is now passed directly to apiStack via props.
    // Keeping temporarily for deployment safety, will remove after verification.

    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: this.emailBucket.bucketName,
      description: '[DEPRECATED] S3 bucket for received emails - use emailStack.emailBucket instead',
    });

    new cdk.CfnOutput(this, 'EmailProcessorArn', {
      value: this.emailProcessorFunction.functionArn,
      description: '[DEPRECATED] Email processor Lambda function ARN - informational only',
    });

    new cdk.CfnOutput(this, 'SESIdentityName', {
      value: props.mailDomain,
      description: '[DEPRECATED] SES email identity (domain) - informational only',
    });

    new cdk.CfnOutput(this, 'DKIMRecords', {
      value: 'Check AWS Console for DKIM records to add to DNS',
      description: '[DEPRECATED] DKIM DNS records - see SES Console',
    });

    new cdk.CfnOutput(this, 'SESReceiptRuleStatus', {
      value: 'SES receipt rule automatically managed by Custom Resource',
      description: '[DEPRECATED] Receipt rule status - managed by Custom Resource',
    });
  }
}
