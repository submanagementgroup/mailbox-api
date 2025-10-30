import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryRows, execute } from '../config/database';
import { verifyPassword } from '../services/passwordService';
import { generateToken, generateRefreshToken } from '../services/jwtService';
import { z } from 'zod';
import { validateInput, successResponse, errorResponse } from '../utils/responses';

/**
 * Local authentication handler
 * POST /auth/login/local
 *
 * Authenticates CLIENT_USER role users with email/password
 * Returns JWT token and user information
 */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

interface UserRecord {
  id: number;
  email: string;
  password_hash: string | null;
  name: string;
  role: 'SYSTEM_ADMIN' | 'TEAM_MEMBER' | 'CLIENT_USER';
  auth_provider: 'local' | 'entra';
  must_change_password: boolean;
  is_active: boolean;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(loginSchema, body);

    // Look up user by email
    const users = await queryRows<UserRecord>(
      `SELECT id, email, password_hash, name, role, auth_provider, must_change_password, is_active
       FROM users
       WHERE email = ?`,
      [input.email]
    );

    if (users.length === 0) {
      return errorResponse('Invalid email or password', 401);
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return errorResponse('Account is inactive. Please contact your administrator.', 403);
    }

    // Check if user uses local authentication
    if (user.auth_provider !== 'local') {
      return errorResponse(
        'This account uses SSO authentication. Please use the SSO login option.',
        400
      );
    }

    // Verify password
    if (!user.password_hash) {
      return errorResponse('Password authentication not configured for this account', 500);
    }

    const isValidPassword = await verifyPassword(input.password, user.password_hash);
    if (!isValidPassword) {
      return errorResponse('Invalid email or password', 401);
    }

    // Update last login timestamp
    await execute(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      authProvider: user.auth_provider,
    };

    const accessToken = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Return success response
    return successResponse({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        authProvider: user.auth_provider,
        mustChangePassword: user.must_change_password,
      },
    }, 200);

  } catch (error: any) {
    console.error('Local login error:', error);

    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400);
    }

    return errorResponse('Authentication failed', 500);
  }
}
