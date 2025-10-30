import {
  SESClient,
  CreateReceiptRuleCommand,
  UpdateReceiptRuleCommand,
  DeleteReceiptRuleCommand,
  DescribeReceiptRuleCommand,
  RuleDoesNotExistException,
  AlreadyExistsException,
  ReceiptRule,
} from '@aws-sdk/client-ses';
import * as https from 'https';
import * as url from 'url';

/**
 * CloudFormation Custom Resource for SES Receipt Rule
 * Handles Create, Update, and Delete lifecycle events
 * CRITICAL: Always sends response to prevent CloudFormation hanging
 */

interface CloudFormationCustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties: {
    RuleSetName: string;
    RuleName: string;
    Recipients: string[];
    S3BucketName: string;
    S3ObjectKeyPrefix: string;
    TlsPolicy: 'Require' | 'Optional';
    Enabled: boolean;
  };
  OldResourceProperties?: any;
}

interface CloudFormationCustomResourceResponse {
  Status: 'SUCCESS' | 'FAILED';
  Reason: string;
  PhysicalResourceId: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  Data?: Record<string, any>;
}

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ca-central-1' });

export async function handler(event: CloudFormationCustomResourceEvent): Promise<void> {
  console.log('Event:', JSON.stringify(event, null, 2));

  let responseStatus: 'SUCCESS' | 'FAILED' = 'SUCCESS';
  let responseData: any = {};
  let physicalResourceId = event.PhysicalResourceId ||
    `${event.ResourceProperties.RuleSetName}:${event.ResourceProperties.RuleName}`;

  try {
    const props = event.ResourceProperties;

    switch (event.RequestType) {
      case 'Create':
        console.log('Creating SES receipt rule...');
        await createReceiptRule(props);
        responseData = {
          RuleName: props.RuleName,
          RuleSetName: props.RuleSetName,
        };
        break;

      case 'Update':
        console.log('Updating SES receipt rule...');
        await updateReceiptRule(props);
        responseData = {
          RuleName: props.RuleName,
          RuleSetName: props.RuleSetName,
        };
        break;

      case 'Delete':
        console.log('Deleting SES receipt rule...');
        await deleteReceiptRule(
          event.ResourceProperties.RuleSetName,
          event.ResourceProperties.RuleName
        );
        responseData = {
          Message: 'Rule deleted successfully',
        };
        break;
    }

    console.log('Operation completed successfully');
  } catch (error: any) {
    console.error('Error:', error);
    responseStatus = 'FAILED';
    responseData = {
      Error: error.message || 'Unknown error',
      ErrorCode: error.code || 'UnknownError',
    };
  } finally {
    // CRITICAL: Always send response, even on error
    // Wrap in timeout for extra safety
    await Promise.race([
      sendResponse(event, responseStatus, responseData, physicalResourceId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout')), 55000)
      ),
    ]).catch((err) => {
      console.error('Failed to send response:', err);
      // Last ditch effort - try one more time
      return sendResponse(event, 'FAILED', { Error: 'Response timeout' }, physicalResourceId);
    });
  }
}

async function createReceiptRule(props: CloudFormationCustomResourceEvent['ResourceProperties']): Promise<void> {
  // Check if rule already exists (idempotency)
  try {
    const existing = await sesClient.send(
      new DescribeReceiptRuleCommand({
        RuleSetName: props.RuleSetName,
        RuleName: props.RuleName,
      })
    );
    console.log('Rule already exists, treating as success (idempotent create)');
    return;
  } catch (error: any) {
    if (!(error instanceof RuleDoesNotExistException)) {
      throw error;
    }
    // Rule doesn't exist, proceed with creation
  }

  const rule: ReceiptRule = {
    Name: props.RuleName,
    Enabled: props.Enabled,
    TlsPolicy: props.TlsPolicy,
    Recipients: props.Recipients,
    Actions: [
      {
        S3Action: {
          BucketName: props.S3BucketName,
          ObjectKeyPrefix: props.S3ObjectKeyPrefix,
        },
      },
    ],
  };

  try {
    await sesClient.send(
      new CreateReceiptRuleCommand({
        RuleSetName: props.RuleSetName,
        Rule: rule,
      })
    );
    console.log('Receipt rule created successfully');
  } catch (error: any) {
    if (error instanceof AlreadyExistsException) {
      console.log('Rule already exists (race condition), treating as success');
      return;
    }
    throw error;
  }
}

async function updateReceiptRule(props: CloudFormationCustomResourceEvent['ResourceProperties']): Promise<void> {
  const rule: ReceiptRule = {
    Name: props.RuleName,
    Enabled: props.Enabled,
    TlsPolicy: props.TlsPolicy,
    Recipients: props.Recipients,
    Actions: [
      {
        S3Action: {
          BucketName: props.S3BucketName,
          ObjectKeyPrefix: props.S3ObjectKeyPrefix,
        },
      },
    ],
  };

  try {
    await sesClient.send(
      new UpdateReceiptRuleCommand({
        RuleSetName: props.RuleSetName,
        Rule: rule,
      })
    );
    console.log('Receipt rule updated successfully');
  } catch (error: any) {
    if (error instanceof RuleDoesNotExistException) {
      // Rule doesn't exist, create it instead
      console.log('Rule does not exist, creating it instead');
      await createReceiptRule(props);
      return;
    }
    throw error;
  }
}

async function deleteReceiptRule(ruleSetName: string, ruleName: string): Promise<void> {
  try {
    await sesClient.send(
      new DeleteReceiptRuleCommand({
        RuleSetName: ruleSetName,
        RuleName: ruleName,
      })
    );
    console.log('Receipt rule deleted successfully');
  } catch (error: any) {
    if (error instanceof RuleDoesNotExistException) {
      // Rule doesn't exist, treat as success (idempotent delete)
      console.log('Rule does not exist, treating delete as success');
      return;
    }
    throw error;
  }
}

async function sendResponse(
  event: CloudFormationCustomResourceEvent,
  status: 'SUCCESS' | 'FAILED',
  data: any,
  physicalResourceId: string
): Promise<void> {
  const responseBody = JSON.stringify({
    Status: status,
    Reason: data.Error || `See CloudWatch logs for details`,
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: data,
  });

  console.log('Sending response:', responseBody);

  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': responseBody.length,
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      console.log(`Response status: ${response.statusCode}`);
      response.on('data', (chunk) => {
        console.log('Response data:', chunk.toString());
      });
      response.on('end', () => {
        console.log('Response sent successfully');
        resolve();
      });
    });

    request.on('error', (error) => {
      console.error('Send response error:', error);
      reject(error);
    });

    request.write(responseBody);
    request.end();
  });
}
