import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireMailboxAccess } from '../middleware/mailboxAccess';
import { successResponse, handleError } from '../middleware/security';
import { queryOne } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { sendEmail } from '../services/emailService';
import { validateInput, replyToMessageSchema } from '../utils/validation';
import { EmailMessage, Mailbox } from '../utils/types';

/**
 * POST /mailboxes/{mailboxId}/messages/{messageId}/reply
 * Reply to an email message
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

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(replyToMessageSchema, body);

    // Get original message
    const message = await queryOne<EmailMessage>(
      `SELECT * FROM email_messages WHERE id = ? AND mailbox_id = ?`,
      [messageId, mailboxId]
    );

    if (!message) {
      return handleError({ statusCode: 404, message: 'Message not found' });
    }

    // Get mailbox email address
    const mailbox = await queryOne<Mailbox>(
      'SELECT email_address FROM mailboxes WHERE id = ?',
      [mailboxId]
    );

    if (!mailbox) {
      return handleError({ statusCode: 404, message: 'Mailbox not found' });
    }

    // Send reply via SES
    const subject = input.subject || `Re: ${message.subject}`;
    await sendEmail({
      from: mailbox.email_address,
      to: message.from_address,
      subject,
      body: input.body,
      replyTo: mailbox.email_address,
    });

    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.SEND_REPLY,
      resourceType: 'message',
      resourceId: messageId,
      details: { to: message.from_address, subject },
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse({ message: 'Reply sent successfully' });
  } catch (error) {
    return handleError(error);
  }
}
