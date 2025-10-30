import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryRows, execute } from '../config/database';
import { verifyPassword, hashPassword, validatePasswordStrength } from '../services/passwordService';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { validateInput, successResponse, errorResponse } from '../utils/responses';

/**
 * Change password handler
 * POST /auth/change-password
 *
 * Allows authenticated users to change their password
 * Required for users with must_change_password flag
 */

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

interface UserRecord {
  id: number;
  email: string;
  password_hash: string | null;
  auth_provider: 'local' | 'entra';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Authenticate user
    const user = await authenticate(event);

    // Parse and validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(changePasswordSchema, body);

    // Only local auth users can change passwords
    const users = await queryRows<UserRecord>(
      `SELECT id, email, password_hash, auth_provider
       FROM users
       WHERE id = ?`,
      [user.userId]
    );

    if (users.length === 0) {
      return errorResponse('User not found', 404);
    }

    const userRecord = users[0];

    if (userRecord.auth_provider !== 'local') {
      return errorResponse(
        'Password change is not available for SSO accounts. Please manage your password through your SSO provider.',
        400
      );
    }

    if (!userRecord.password_hash) {
      return errorResponse('Password authentication not configured for this account', 500);
    }

    // Verify current password
    const isValidPassword = await verifyPassword(input.currentPassword, userRecord.password_hash);
    if (!isValidPassword) {
      return errorResponse('Current password is incorrect', 401);
    }

    // Validate new password strength
    const validation = validatePasswordStrength(input.newPassword);
    if (!validation.isValid) {
      return errorResponse(validation.error || 'Invalid password', 400);
    }

    // Ensure new password is different from current
    const isSamePassword = await verifyPassword(input.newPassword, userRecord.password_hash);
    if (isSamePassword) {
      return errorResponse('New password must be different from current password', 400);
    }

    // Hash new password
    const newPasswordHash = await hashPassword(input.newPassword);

    // Update password and clear must_change_password flag
    await execute(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = FALSE,
           updated_at = NOW()
       WHERE id = ?`,
      [newPasswordHash, user.userId]
    );

    // Log audit event
    await execute(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address)
       VALUES (?, 'PASSWORD_CHANGED', 'USER', ?, ?)`,
      [user.userId, user.userId, event.requestContext?.identity?.sourceIp || undefined]
    );

    return successResponse({
      message: 'Password changed successfully',
    }, 200);

  } catch (error: any) {
    console.error('Change password error:', error);

    if (error.message === 'Unauthorized') {
      return errorResponse('Authentication required', 401);
    }

    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400);
    }

    return errorResponse('Failed to change password', 500);
  }
}
