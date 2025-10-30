import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { successResponse, handleError } from '../middleware/security';
import { query } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';

/**
 * DELETE /admin/whitelist/senders/{id}
 * Delete a whitelisted sender domain
 * Requires SYSTEM_ADMIN role
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);
    requireAdmin(user);

    // Get sender ID from path parameters
    const senderId = event.pathParameters?.id;
    if (!senderId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Sender ID is required' }),
      };
    }

    // Delete whitelisted sender
    const result = await query(
      `DELETE FROM whitelisted_senders WHERE id = ?`,
      [senderId]
    );

    if (result.affectedRows === 0) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Whitelisted sender not found' }),
      };
    }

    // Log audit event
    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.REMOVE_WHITELISTED_SENDER,
      resourceType: 'whitelist_sender',
      resourceId: parseInt(senderId),
      details: {
        senderId,
      },
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent,
    });

    return successResponse(
      {
        message: 'Whitelisted sender deleted successfully',
      },
      200
    );
  } catch (error) {
    return handleError(error);
  }
}
