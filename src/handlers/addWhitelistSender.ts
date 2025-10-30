import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { successResponse, handleError } from '../middleware/security';
import { insert } from '../config/database';
import { logAudit, AuditAction } from '../services/auditLogger';
import { validateInput, addWhitelistSenderSchema } from '../utils/validation';

/**
 * POST /admin/whitelist/senders
 * Add a whitelisted sender domain (with wildcard support)
 * Requires SYSTEM_ADMIN role
 *
 * Supports:
 * - Exact domain: "canadacouncil.ca"
 * - Subdomain wildcard: "*.gc.ca" (matches sub.gc.ca but not gc.ca)
 * - Prefix wildcard: "*canadacouncil.ca" (matches historycanadacouncil.ca and canadacouncil.ca)
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);
    requireAdmin(user);

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(addWhitelistSenderSchema, body);

    // Insert whitelisted sender domain
    const id = await insert(
      `INSERT INTO whitelisted_senders (domain, added_by)
       VALUES (?, ?)`,
      [input.domain, user.entraId]
    );

    // Log audit event
    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.ADD_WHITELISTED_SENDER,
      resourceType: 'whitelist_sender',
      resourceId: id,
      details: {
        domain: input.domain,
      },
      ipAddress: event.requestContext.identity.sourceIp || undefined,
      userAgent: event.requestContext.identity.userAgent || undefined,
    });

    return successResponse(
      {
        id,
        domain: input.domain,
        message: 'Whitelisted sender domain added successfully',
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
