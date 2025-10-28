import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireMailboxAccess } from '../middleware/mailboxAccess';
import { successResponse, handleError } from '../middleware/security';
import { queryRows, queryOne } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { validateInput, listMessagesQuerySchema } from '../utils/validation';
import { EmailMessage, PaginatedResponse } from '../utils/types';

/**
 * GET /mailboxes/{mailboxId}/messages
 * List messages in a mailbox with pagination
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Authenticate user
    const user = await authenticate(event);

    // Extract mailbox ID
    const mailboxId = parseInt(event.pathParameters?.mailboxId || '');
    if (isNaN(mailboxId)) {
      return handleError({ statusCode: 400, message: 'Invalid mailbox ID' });
    }

    // Verify mailbox access
    await requireMailboxAccess(user, mailboxId);

    // Validate query parameters
    const query = validateInput(listMessagesQuerySchema, event.queryStringParameters || {});

    // Calculate pagination
    const offset = (query.page - 1) * query.pageSize;

    // Get total count
    const countResult = await queryOne<{ total: number }>(
      'SELECT COUNT(*) as total FROM email_messages WHERE mailbox_id = ?',
      [mailboxId]
    );
    const total = countResult?.total || 0;

    // Get messages
    const messages = await queryRows<EmailMessage>(
      `SELECT id, message_id, from_address, to_address, subject, received_at, created_at
       FROM email_messages
       WHERE mailbox_id = ?
       ORDER BY received_at DESC
       LIMIT ? OFFSET ?`,
      [mailboxId, query.pageSize, offset]
    );

    // Build paginated response
    const response: PaginatedResponse<EmailMessage> = {
      items: messages,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };

    // Log audit event
    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.VIEW_MESSAGES,
      resourceType: 'mailbox',
      resourceId: mailboxId,
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse(response);
  } catch (error) {
    return handleError(error);
  }
}
