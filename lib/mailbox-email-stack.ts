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
      runtime: lambda.Runtime.NODEJS_20_X,
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
    // SES RECEIPT RULE SET
    // ============================================
    // Note: SES receipt rules must be configured manually or via AWS CLI
    // because CDK doesn't support active receipt rule sets fully
    // The rule should:
    // 1. Store email to S3: s3://${emailBucket}/incoming/${timestamp}.eml
    // 2. Lambda is triggered by S3 event (configured above)

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

    // ============================================
    // OUTPUTS
    // ============================================
    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: this.emailBucket.bucketName,
      description: 'S3 bucket for received emails',
    });

    new cdk.CfnOutput(this, 'EmailProcessorArn', {
      value: this.emailProcessorFunction.functionArn,
      description: 'Email processor Lambda function ARN',
    });

    new cdk.CfnOutput(this, 'SESIdentityName', {
      value: props.mailDomain,
      description: 'SES email identity (domain)',
    });

    new cdk.CfnOutput(this, 'DKIMRecords', {
      value: 'Check AWS Console for DKIM records to add to DNS',
      description: 'DKIM DNS records (see SES Console)',
    });

    new cdk.CfnOutput(this, 'SESReceiptRuleCommand', {
      value: `aws ses create-receipt-rule --rule-set-name default-rule-set --rule '{"Name":"${props.targetEnvironment}-mailbox-rule","Enabled":true,"TlsPolicy":"Require","Recipients":["${props.mailDomain}"],"Actions":[{"S3Action":{"BucketName":"${this.emailBucket.bucketName}","ObjectKeyPrefix":"incoming/"}}]}'`,
      description: 'AWS CLI command to create SES receipt rule',
    });
  }
}
