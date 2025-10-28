#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack, EnvironmentType, TargetEnvironment } from '@submanagementgroup/cdk-pipelines-client';
import { Construct } from 'constructs';
import { MailboxDbStack } from '../lib/mailbox-db-stack';
import { MailboxEmailStack } from '../lib/mailbox-email-stack';
import { MailboxApiStack } from '../lib/mailbox-api-stack';

const app = new cdk.App();

// Get the target environment from context or environment variables
const targetEnv = app.node.tryGetContext('target-env') || process.env.TARGET_ENV || 'dev';

// Account configurations
const DEV_ACCOUNT = "484907522964";
const PROD_ACCOUNT = "794038237156";
const REGION = "ca-central-1";

// Determine which pipeline to create based on target environment
if (targetEnv === 'dev' || targetEnv === 'development') {
  // ============================================
  // DEVELOPMENT PIPELINE
  // ============================================
  const devPipeline = new PipelineStack(app, 'dev-mailbox-api-pipeline', {
  branch: "develop",
  codeconnectionArn: "arn:aws:codeconnections:ca-central-1:484907522964:connection/64a3746c-a26c-410a-8acc-1741c50813be",
  env: {
    account: DEV_ACCOUNT,
    region: REGION,
  },
  owner: "submanagementgroup",
  repo: "mailbox-api",
  targetEnvironments: [{
    name: "mailbox-api",
    type: EnvironmentType.DEVELOPMENT,
    account: DEV_ACCOUNT,
    region: REGION,
  }],
  stacks(context: Construct, env: TargetEnvironment) {
    // Stack 1: Database (Aurora + Redis)
    const dbStack = new MailboxDbStack(context, 'database-stack', {
      env: env,
      targetEnvironment: 'dev',
    });
    cdk.Tags.of(dbStack).add('Component', 'mailbox-api');
    cdk.Tags.of(dbStack).add('Environment', 'Development');

    // Stack 2: Email (SES + S3 + Lambda processor)
    const emailStack = new MailboxEmailStack(context, 'email-stack', {
      env: env,
      targetEnvironment: 'dev',
      mailDomain: 'mail.dev.submanagementgroup.com',
      vpc: dbStack.vpc,
      dbCluster: dbStack.dbCluster,
      dbSecret: dbStack.dbSecret,
      lambdaSecurityGroup: dbStack.lambdaSecurityGroup,
    });
    emailStack.addDependency(dbStack);
    cdk.Tags.of(emailStack).add('Component', 'mailbox-api');
    cdk.Tags.of(emailStack).add('Environment', 'Development');

    // Stack 3: API Gateway + Lambda functions
    const apiStack = new MailboxApiStack(context, 'api-stack', {
      env: env,
      targetEnvironment: 'dev',
      domainName: 'mail.dev.submanagementgroup.com',
      vpc: dbStack.vpc,
      dbCluster: dbStack.dbCluster,
      dbSecret: dbStack.dbSecret,
      redisCluster: dbStack.redisCluster,
      lambdaSecurityGroup: dbStack.lambdaSecurityGroup,
    });
    apiStack.addDependency(dbStack);
    cdk.Tags.of(apiStack).add('Component', 'mailbox-api');
    cdk.Tags.of(apiStack).add('Environment', 'Development');
  },
  });
  cdk.Tags.of(devPipeline).add('Component', 'mailbox-api-pipeline');
} else if (targetEnv === 'prod' || targetEnv === 'production') {
  // ============================================
  // PRODUCTION PIPELINE
  // ============================================
  const prodPipeline = new PipelineStack(app, 'prod-mailbox-api-pipeline', {
  branch: "main",
  codeconnectionArn: "arn:aws:codeconnections:ca-central-1:794038237156:connection/TBD", // TODO: Get prod CodeConnection ARN
  env: {
    account: PROD_ACCOUNT,
    region: REGION,
  },
  owner: "submanagementgroup",
  repo: "mailbox-api",
  targetEnvironments: [{
    name: "mailbox-api",
    type: EnvironmentType.PRODUCTION,
    account: PROD_ACCOUNT,
    region: REGION,
  }],
  stacks(context: Construct, env: TargetEnvironment) {
    // Stack 1: Database (Aurora + Redis)
    const dbStack = new MailboxDbStack(context, 'database-stack', {
      env: env,
      targetEnvironment: 'prod',
    });
    cdk.Tags.of(dbStack).add('Component', 'mailbox-api');
    cdk.Tags.of(dbStack).add('Environment', 'Production');

    // Stack 2: Email (SES + S3 + Lambda processor)
    const emailStack = new MailboxEmailStack(context, 'email-stack', {
      env: env,
      targetEnvironment: 'prod',
      mailDomain: 'mail.submanagementgroup.com',
      vpc: dbStack.vpc,
      dbCluster: dbStack.dbCluster,
      dbSecret: dbStack.dbSecret,
      lambdaSecurityGroup: dbStack.lambdaSecurityGroup,
    });
    emailStack.addDependency(dbStack);
    cdk.Tags.of(emailStack).add('Component', 'mailbox-api');
    cdk.Tags.of(emailStack).add('Environment', 'Production');

    // Stack 3: API Gateway + Lambda functions
    const apiStack = new MailboxApiStack(context, 'api-stack', {
      env: env,
      targetEnvironment: 'prod',
      domainName: 'mail.submanagementgroup.com',
      vpc: dbStack.vpc,
      dbCluster: dbStack.dbCluster,
      dbSecret: dbStack.dbSecret,
      redisCluster: dbStack.redisCluster,
      lambdaSecurityGroup: dbStack.lambdaSecurityGroup,
    });
    apiStack.addDependency(dbStack);
    cdk.Tags.of(apiStack).add('Component', 'mailbox-api');
    cdk.Tags.of(apiStack).add('Environment', 'Production');
  },
  });
  cdk.Tags.of(prodPipeline).add('Component', 'mailbox-api-pipeline');
} else {
  throw new Error(`Unknown target environment: ${targetEnv}. Use 'dev' or 'prod'`);
}
