import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { successResponse, handleError } from '../middleware/security';
import { insert } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { validateInput, createMailboxSchema } from '../utils/validation';

/**
 * POST /admin/mailboxes
 * Create a new mailbox (admin only)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Authenticate and authorize
    const user = await authenticate(event);
    requireAdmin(user);

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(createMailboxSchema, body);

    // Create mailbox in database
    const mailboxId = await insert(
      `INSERT INTO mailboxes (email_address, quota_mb, is_active, created_by)
       VALUES (?, ?, ?, ?)`,
      [input.emailAddress, input.quotaMb, true, user.entraId]
    );

    // Log audit event
    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.CREATE_MAILBOX,
      resourceType: 'mailbox',
      resourceId: mailboxId,
      details: {
        emailAddress: input.emailAddress,
        quotaMb: input.quotaMb,
      },
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    // Return success response
    return successResponse(
      {
        id: mailboxId,
        emailAddress: input.emailAddress,
        quotaMb: input.quotaMb,
        isActive: true,
        message: 'Mailbox created successfully',
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
