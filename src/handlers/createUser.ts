import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorize';
import { successResponse, handleError } from '../middleware/security';
import { logAudit, AuditAction } from '../services/auditLogger';
import { createUser as createEntraUser } from '../services/graphService';
import { validateInput, createUserSchema } from '../utils/validation';

/**
 * POST /admin/users
 * Create new user in Azure Entra External ID
 * Requires SYSTEM_ADMIN role
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);

    // Require admin role
    requireAdmin(user);

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(createUserSchema, body);

    // Create user in Azure Entra via Graph API
    const result = await createEntraUser(
      input.email,
      input.displayName,
      input.role
    );

    await logAudit({
      entraUserId: user.entraId,
      userEmail: user.email,
      action: AuditAction.CREATE_USER,
      resourceType: 'user',
      details: {
        email: input.email,
        role: input.role,
        newUserId: result.userId,
      },
      ipAddress: event.requestContext.identity.sourceIp || undefined,
      userAgent: event.requestContext.identity.userAgent || undefined,
    });

    return successResponse(
      {
        userId: result.userId,
        email: result.email,
        temporaryPassword: result.temporaryPassword,
        message: 'User created successfully. Temporary password must be changed on first login.',
      },
      201
    );
  } catch (error) {
    return handleError(error);
  }
}
