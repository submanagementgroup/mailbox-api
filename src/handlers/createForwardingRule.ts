import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireMailboxAccess } from '../middleware/mailboxAccess';
import { successResponse, handleError } from '../middleware/security';
import { queryOne, insert } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { validateInput, createForwardingRuleSchema } from '../utils/validation';

/**
 * POST /mailboxes/{mailboxId}/forwarding
 * Create user forwarding rule
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);

    const mailboxId = parseInt(event.pathParameters?.mailboxId || '');
    if (isNaN(mailboxId)) {
      return handleError({ statusCode: 400, message: 'Invalid mailbox ID' });
    }

    await requireMailboxAccess(user, mailboxId);

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(createForwardingRuleSchema, body);

    // Check if recipient is whitelisted
    const isWhitelisted = await queryOne<{ id: number }>(
      'SELECT id FROM whitelisted_recipients WHERE email = ?',
      [input.recipientEmail]
    );

    if (!isWhitelisted) {
      return handleError({
        statusCode: 403,
        message: 'Recipient email is not whitelisted. Contact admin to add.',
      });
    }

    // Create forwarding rule
    const ruleId = await insert(
      `INSERT INTO user_forwarding_rules (mailbox_id, recipient_email, is_enabled, created_by)
       VALUES (?, ?, ?, ?)`,
      [mailboxId, input.recipientEmail, input.isEnabled, user.entraId]
    );

    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.CREATE_FORWARDING_RULE,
      resourceType: 'forwarding_rule',
      resourceId: ruleId,
      details: { recipientEmail: input.recipientEmail },
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse({ id: ruleId, message: 'Forwarding rule created' }, 201);
  } catch (error) {
    return handleError(error);
  }
}
