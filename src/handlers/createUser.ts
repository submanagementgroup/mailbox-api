import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { authenticate, requireAdmin } from '../middleware/auth';
import { insert, queryRows, execute } from '../config/database';
import { generateTemporaryPassword, hashPassword } from '../services/passwordService';
import { sendTemporaryPasswordEmail } from '../services/emailService';
import { z } from 'zod';
import { validateInput, successResponse, errorResponse } from '../utils/responses';
import { UserRole } from '../utils/types';

/**
 * POST /admin/users
 * Create new user with hybrid authentication support
 * - CLIENT_USER: Local auth (email/password)
 * - TEAM_MEMBER/SYSTEM_ADMIN: Entra SSO (no password stored)
 * Requires admin role
 */

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['SYSTEM_ADMIN', 'TEAM_MEMBER', 'CLIENT_USER']),
  sendPasswordEmail: z.boolean().optional().default(false),
});

/**
 * Determine auth provider based on email domain and role
 */
function getAuthProvider(email: string, role: UserRole): 'local' | 'entra' {
  const domain = email.split('@')[1]?.toLowerCase();

  // SSO for @submanagementgroup.com (staff)
  if (domain === 'submanagementgroup.com') {
    return 'entra';
  }

  // Force SSO for admin roles even if not @submanagementgroup.com
  if (role === 'SYSTEM_ADMIN' || role === 'TEAM_MEMBER') {
    return 'entra';
  }

  // Local auth for CLIENT_USER
  return 'local';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const user = await authenticate(event);
    requireAdmin(user);

    // Validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(createUserSchema, body);

    // Check if user already exists
    const existingUsers = await queryRows(
      'SELECT id, email FROM users WHERE email = ?',
      [input.email]
    );

    if (existingUsers.length > 0) {
      return errorResponse('User with this email already exists', 409);
    }

    // Determine auth provider
    const authProvider = getAuthProvider(input.email, input.role as UserRole);

    let temporaryPassword: string | undefined;
    let passwordHash: string | null = null;

    // Generate password for local auth users
    if (authProvider === 'local') {
      temporaryPassword = generateTemporaryPassword(16);
      passwordHash = await hashPassword(temporaryPassword);
    }

    // Create user in database
    const userId = await insert(
      `INSERT INTO users (email, password_hash, name, role, auth_provider, must_change_password, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.email,
        passwordHash,
        input.name,
        input.role,
        authProvider,
        authProvider === 'local', // Force password change for local users
        true,
        user.userId,
      ]
    );

    // Send temporary password email if requested and applicable
    if (temporaryPassword && input.sendPasswordEmail) {
      try {
        await sendTemporaryPasswordEmail(input.email, temporaryPassword, input.name);
      } catch (emailError) {
        console.error('Failed to send password email:', emailError);
        // Don't fail the entire operation if email fails
      }
    }

    // Log audit event
    await execute(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, 'USER_CREATED', 'USER', ?, ?, ?)`,
      [
        user.userId,
        userId,
        JSON.stringify({
          email: input.email,
          role: input.role,
          authProvider,
        }),
        event.requestContext?.identity?.sourceIp || undefined,
      ]
    );

    // Response based on auth provider
    if (authProvider === 'local' && temporaryPassword) {
      return successResponse(
        {
          userId,
          email: input.email,
          name: input.name,
          role: input.role,
          authProvider,
          temporaryPassword,
          passwordEmailSent: input.sendPasswordEmail,
          message: 'User created successfully. Temporary password must be changed on first login.',
        },
        201
      );
    } else {
      return successResponse(
        {
          userId,
          email: input.email,
          name: input.name,
          role: input.role,
          authProvider: 'entra',
          message: 'User created successfully. User will authenticate via Azure Entra SSO.',
        },
        201
      );
    }
  } catch (error: any) {
    console.error('Create user error:', error);

    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400);
    }

    if (error.message === 'Unauthorized') {
      return errorResponse('Authentication required', 401);
    }

    if (error.message === 'Admin access required') {
      return errorResponse('Admin access required', 403);
    }

    return errorResponse('Failed to create user', 500);
  }
}
