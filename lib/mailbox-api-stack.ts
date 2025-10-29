import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface MailboxApiStackProps extends cdk.StackProps {
  targetEnvironment: 'dev' | 'prod';
  domainName: string;
  vpc: ec2.IVpc;
  dbCluster: rds.DatabaseCluster;
  dbSecret: secretsmanager.ISecret;
  redisCluster: elasticache.CfnCacheCluster;
  lambdaSecurityGroup: ec2.ISecurityGroup;
}

export class MailboxApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly authorizerFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: MailboxApiStackProps) {
    super(scope, id, props);

    const isProd = props.targetEnvironment === 'prod';

    // ============================================
    // LAMBDA LAYER (Shared Dependencies)
    // ============================================
    // TODO: Create actual Lambda layer with packaged dependencies
    // For now, Lambda functions will package their own dependencies
    // Uncomment and create proper layer asset when ready:
    // const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
    //   layerVersionName: `${props.targetEnvironment}-mailbox-api-shared`,
    //   code: lambda.Code.fromAsset('layers/nodejs'),
    //   compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
    //   description: 'Shared dependencies for mailbox API Lambda functions',
    // });

    // ============================================
    // COMMON LAMBDA CONFIGURATION
    // ============================================
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        DB_HOST: props.dbCluster.clusterEndpoint.hostname,
        DB_NAME: 'email_platform',
        DB_SECRET_ARN: props.dbSecret.secretArn,
        REDIS_HOST: props.redisCluster.attrRedisEndpointAddress,
        REDIS_PORT: props.redisCluster.attrRedisEndpointPort,
        ENVIRONMENT: props.targetEnvironment,
        NODE_ENV: isProd ? 'production' : 'development',
      },
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.lambdaSecurityGroup],
      logRetention: logs.RetentionDays.ONE_MONTH,
      tracing: lambda.Tracing.ACTIVE, // X-Ray distributed tracing
      architecture: lambda.Architecture.ARM_64, // Cost savings (~20% cheaper)
      // layers: [sharedLayer], // Add when layer is created
    };

    // ============================================
    // JWT AUTHORIZER LAMBDA
    // ============================================
    this.authorizerFunction = new lambda.Function(this, 'Authorizer', {
      ...commonLambdaProps,
      functionName: `${props.targetEnvironment}-mailbox-authorizer`,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
// Placeholder JWT authorizer
// Will be replaced with actual Azure Entra ID JWT validation
exports.handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  const token = event.authorizationToken?.replace('Bearer ', '');

  // TODO: Implement actual JWT validation:
  // 1. Extract JWT from Authorization header
  // 2. Fetch JWKS from Azure Entra External ID
  // 3. Verify JWT signature
  // 4. Validate issuer, audience, expiration
  // 5. Extract user claims (sub, email, roles)
  // 6. Return IAM policy allowing/denying access

  // Placeholder: Allow all requests in development
  return {
    principalId: 'dev-user',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: event.methodArn.split('/').slice(0, 2).join('/') + '/*'
      }]
    },
    context: {
      entraId: 'placeholder-user-id',
      email: 'dev@example.com',
      roles: JSON.stringify(['SYSTEM_ADMIN'])
    }
  };
};
      `),
    });

    // Grant authorizer access to secrets (for JWT validation keys)
    props.dbSecret.grantRead(this.authorizerFunction);

    // ============================================
    // API GATEWAY REST API
    // ============================================
    this.api = new apigateway.RestApi(this, 'MailboxApi', {
      restApiName: `${props.targetEnvironment}-mailbox-api`,
      description: `Email MFA Platform API (${props.targetEnvironment})`,
      deployOptions: {
        stageName: props.targetEnvironment,
        tracingEnabled: true, // X-Ray distributed tracing for API Gateway
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: !isProd,
        metricsEnabled: true,
        throttlingBurstLimit: isProd ? 5000 : 100,
        throttlingRateLimit: isProd ? 2000 : 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: isProd
          ? [`https://${props.domainName}`]
          : ['*'], // Allow all origins in dev for testing
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    // ============================================
    // TOKEN AUTHORIZER
    // ============================================
    const authorizer = new apigateway.TokenAuthorizer(this, 'JWTAuthorizer', {
      handler: this.authorizerFunction,
      identitySource: 'method.request.header.Authorization',
      authorizerName: `${props.targetEnvironment}-mailbox-jwt-authorizer`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // ============================================
    // PLACEHOLDER LAMBDA FUNCTIONS
    // ============================================
    // These will be replaced with actual implementations in future commits

    const createPlaceholderFunction = (name: string, route: string) => {
      return new lambda.Function(this, name, {
        ...commonLambdaProps,
        functionName: `${props.targetEnvironment}-mailbox-${name.toLowerCase()}`,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  console.log('${name} called:', JSON.stringify(event, null, 2));

  // Extract user context from authorizer
  const userContext = event.requestContext?.authorizer || {};

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: '${name} endpoint - placeholder',
      route: '${route}',
      user: userContext,
      timestamp: new Date().toISOString()
    })
  };
};
        `),
      });
    };

    // Grant database secret read access to all Lambda functions
    const grantSecretsAccess = (fn: lambda.Function) => {
      props.dbSecret.grantRead(fn);
    };

    // ============================================
    // API ROUTES - AUTHENTICATION
    // ============================================
    const authResource = this.api.root.addResource('auth');

    const loginCallbackFunction = createPlaceholderFunction('LoginCallback', 'POST /auth/callback');
    grantSecretsAccess(loginCallbackFunction);
    authResource.addResource('callback').addMethod(
      'POST',
      new apigateway.LambdaIntegration(loginCallbackFunction)
    );

    const logoutFunction = createPlaceholderFunction('Logout', 'POST /auth/logout');
    grantSecretsAccess(logoutFunction);
    authResource.addResource('logout').addMethod(
      'POST',
      new apigateway.LambdaIntegration(logoutFunction),
      { authorizer }
    );

    const tokenRefreshFunction = createPlaceholderFunction('TokenRefresh', 'POST /auth/refresh');
    grantSecretsAccess(tokenRefreshFunction);
    authResource.addResource('refresh').addMethod(
      'POST',
      new apigateway.LambdaIntegration(tokenRefreshFunction),
      { authorizer }
    );

    // ============================================
    // API ROUTES - MAILBOXES
    // ============================================
    const mailboxesResource = this.api.root.addResource('mailboxes');

    const listMailboxesFunction = createPlaceholderFunction('ListMailboxes', 'GET /mailboxes');
    grantSecretsAccess(listMailboxesFunction);
    mailboxesResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listMailboxesFunction),
      { authorizer }
    );

    const mailboxResource = mailboxesResource.addResource('{mailboxId}');

    // Messages routes
    const messagesResource = mailboxResource.addResource('messages');

    const listMessagesFunction = createPlaceholderFunction('ListMessages', 'GET /mailboxes/{id}/messages');
    grantSecretsAccess(listMessagesFunction);
    messagesResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listMessagesFunction),
      { authorizer }
    );

    const messageResource = messagesResource.addResource('{messageId}');

    const getMessageFunction = createPlaceholderFunction('GetMessage', 'GET /mailboxes/{id}/messages/{messageId}');
    grantSecretsAccess(getMessageFunction);
    messageResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getMessageFunction),
      { authorizer }
    );

    const replyFunction = createPlaceholderFunction('ReplyToMessage', 'POST /mailboxes/{id}/messages/{messageId}/reply');
    grantSecretsAccess(replyFunction);
    messageResource.addResource('reply').addMethod(
      'POST',
      new apigateway.LambdaIntegration(replyFunction),
      { authorizer }
    );

    // Forwarding rules routes
    const forwardingResource = mailboxResource.addResource('forwarding');

    const listForwardingRulesFunction = createPlaceholderFunction('ListForwardingRules', 'GET /mailboxes/{id}/forwarding');
    grantSecretsAccess(listForwardingRulesFunction);
    forwardingResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listForwardingRulesFunction),
      { authorizer }
    );

    const createForwardingRuleFunction = createPlaceholderFunction('CreateForwardingRule', 'POST /mailboxes/{id}/forwarding');
    grantSecretsAccess(createForwardingRuleFunction);
    forwardingResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createForwardingRuleFunction),
      { authorizer }
    );

    const forwardingRuleResource = forwardingResource.addResource('{ruleId}');

    const updateForwardingRuleFunction = createPlaceholderFunction('UpdateForwardingRule', 'PUT /mailboxes/{id}/forwarding/{ruleId}');
    grantSecretsAccess(updateForwardingRuleFunction);
    forwardingRuleResource.addMethod(
      'PUT',
      new apigateway.LambdaIntegration(updateForwardingRuleFunction),
      { authorizer }
    );

    const deleteForwardingRuleFunction = createPlaceholderFunction('DeleteForwardingRule', 'DELETE /mailboxes/{id}/forwarding/{ruleId}');
    grantSecretsAccess(deleteForwardingRuleFunction);
    forwardingRuleResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(deleteForwardingRuleFunction),
      { authorizer }
    );

    // ============================================
    // API ROUTES - ADMIN
    // ============================================
    const adminResource = this.api.root.addResource('admin');

    // User management
    const usersResource = adminResource.addResource('users');

    const listUsersFunction = createPlaceholderFunction('ListUsers', 'GET /admin/users');
    grantSecretsAccess(listUsersFunction);
    usersResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listUsersFunction),
      { authorizer }
    );

    const createUserFunction = createPlaceholderFunction('CreateUser', 'POST /admin/users');
    grantSecretsAccess(createUserFunction);
    usersResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createUserFunction),
      { authorizer }
    );

    // Whitelist management
    const whitelistResource = adminResource.addResource('whitelist');

    const sendersResource = whitelistResource.addResource('senders');
    const listWhitelistSendersFunction = createPlaceholderFunction('ListWhitelistSenders', 'GET /admin/whitelist/senders');
    grantSecretsAccess(listWhitelistSendersFunction);
    sendersResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listWhitelistSendersFunction),
      { authorizer }
    );

    // Audit log
    const auditLogFunction = createPlaceholderFunction('GetAuditLog', 'GET /admin/audit-log');
    grantSecretsAccess(auditLogFunction);
    adminResource.addResource('audit-log').addMethod(
      'GET',
      new apigateway.LambdaIntegration(auditLogFunction),
      { authorizer }
    );

    // ============================================
    // OUTPUTS
    // ============================================
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${props.targetEnvironment}-mailbox-api-url`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'API Gateway ID',
      exportName: `${props.targetEnvironment}-mailbox-api-id`,
    });

    new cdk.CfnOutput(this, 'AuthorizerFunctionArn', {
      value: this.authorizerFunction.functionArn,
      description: 'JWT Authorizer Lambda ARN',
      exportName: `${props.targetEnvironment}-mailbox-authorizer-arn`,
    });
  }
}
