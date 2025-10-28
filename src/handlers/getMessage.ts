import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireMailboxAccess } from '../middleware/mailboxAccess';
import { successResponse, handleError } from '../middleware/security';
import { queryOne } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { EmailMessage } from '../utils/types';

/**
 * GET /mailboxes/{mailboxId}/messages/{messageId}
 * Get single message details
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);

    const mailboxId = parseInt(event.pathParameters?.mailboxId || '');
    const messageId = parseInt(event.pathParameters?.messageId || '');

    if (isNaN(mailboxId) || isNaN(messageId)) {
      return handleError({ statusCode: 400, message: 'Invalid mailbox or message ID' });
    }

    await requireMailboxAccess(user, mailboxId);

    // Get full message including body
    const message = await queryOne<EmailMessage>(
      `SELECT * FROM email_messages
       WHERE id = ? AND mailbox_id = ?`,
      [messageId, mailboxId]
    );

    if (!message) {
      return handleError({ statusCode: 404, message: 'Message not found' });
    }

    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.VIEW_MESSAGE,
      resourceType: 'message',
      resourceId: messageId,
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse(message);
  } catch (error) {
    return handleError(error);
  }
}
