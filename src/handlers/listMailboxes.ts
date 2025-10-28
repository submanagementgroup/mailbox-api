import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { getUserMailboxIds } from '../middleware/mailboxAccess';
import { successResponse, handleError } from '../middleware/security';
import { queryRows } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { Mailbox } from '../utils/types';

/**
 * GET /mailboxes
 * List mailboxes accessible to the authenticated user
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Authenticate user
    const user = await authenticate(event);

    // Get mailbox IDs user has access to
    const mailboxIds = await getUserMailboxIds(user);

    if (mailboxIds.length === 0) {
      return successResponse([]);
    }

    // Fetch mailbox details
    const placeholders = mailboxIds.map(() => '?').join(',');
    const mailboxes = await queryRows<Mailbox>(
      `SELECT id, email_address, quota_mb, is_active, created_at, updated_at
       FROM mailboxes
       WHERE id IN (${placeholders}) AND is_active = 1
       ORDER BY email_address`,
      mailboxIds
    );

    // Log audit event
    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.VIEW_MAILBOX,
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse(mailboxes);
  } catch (error) {
    return handleError(error);
  }
}
