import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryRows, execute } from '../config/database';
import { generateToken, generateRefreshToken } from '../services/jwtService';
import axios from 'axios';
import { z } from 'zod';
import { validateInput, successResponse, errorResponse } from '../utils/responses';
import { UserRole } from '../utils/types';

/**
 * Azure Entra OAuth callback handler
 * POST /auth/callback
 *
 * Handles OAuth2 authorization code flow for Enterprise App SSO
 * - Exchanges authorization code for tokens
 * - Validates user in database
 * - Creates user record if first login (with entra_oid)
 * - Returns JWT token for API access
 */

const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

interface EntraTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface EntraUserInfo {
  oid: string; // Object ID
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

interface UserRecord {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  auth_provider: 'local' | 'entra';
  entra_oid: string | null;
  is_active: boolean;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string): Promise<EntraTokenResponse> {
  const tokenEndpoint = `${process.env.ENTRA_AUTHORITY}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: process.env.ENTRA_CLIENT_ID || '',
    client_secret: process.env.ENTRA_CLIENT_SECRET || '',
    code,
    redirect_uri: process.env.ENTRA_REDIRECT_URI || '',
    grant_type: 'authorization_code',
    scope: 'openid profile email',
  });

  try {
    const response = await axios.post<EntraTokenResponse>(tokenEndpoint, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Token exchange failed:', error.response?.data || error.message);
    throw new Error('Failed to exchange authorization code for tokens');
  }
}

/**
 * Decode JWT token to extract user info (without verification)
 * Token is already verified by Azure
 */
function decodeIdToken(idToken: string): EntraUserInfo {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload as EntraUserInfo;
  } catch (error) {
    console.error('Failed to decode ID token:', error);
    throw new Error('Invalid ID token');
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(callbackSchema, body);

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(input.code);

    // Decode ID token to get user info
    const userInfo = decodeIdToken(tokens.id_token);

    if (!userInfo.oid) {
      return errorResponse('Missing user Object ID in token', 400);
    }

    const email = userInfo.email || userInfo.preferred_username;
    if (!email) {
      return errorResponse('Missing email in user profile', 400);
    }

    // Look up user by Entra OID or email
    let users = await queryRows<UserRecord>(
      `SELECT id, email, name, role, auth_provider, entra_oid, is_active
       FROM users
       WHERE entra_oid = ? OR (email = ? AND auth_provider = 'entra')`,
      [userInfo.oid, email]
    );

    let user: UserRecord;

    if (users.length === 0) {
      // User not found - check if they should have access
      // Only allow @submanagementgroup.com domain for auto-creation
      const domain = email.split('@')[1]?.toLowerCase();
      if (domain !== 'submanagementgroup.com') {
        return errorResponse(
          'Account not found. Please contact your administrator to create an account.',
          404
        );
      }

      // Auto-create user for @submanagementgroup.com (staff)
      const displayName = userInfo.name || userInfo.given_name || email.split('@')[0];

      // Default role for staff - can be updated by admin later
      const defaultRole: UserRole = 'TEAM_MEMBER';

      const userId = await execute(
        `INSERT INTO users (email, name, role, auth_provider, entra_oid, is_active)
         VALUES (?, ?, ?, 'entra', ?, TRUE)`,
        [email, displayName, defaultRole, userInfo.oid]
      );

      // Fetch newly created user
      users = await queryRows<UserRecord>(
        'SELECT id, email, name, role, auth_provider, entra_oid, is_active FROM users WHERE id = ?',
        [userId]
      );

      if (users.length === 0) {
        return errorResponse('Failed to create user', 500);
      }

      user = users[0];

      console.log('Auto-created Entra user:', { userId, email, role: defaultRole });
    } else {
      user = users[0];

      // Update entra_oid if not set (for existing users)
      if (!user.entra_oid && userInfo.oid) {
        await execute(
          'UPDATE users SET entra_oid = ?, updated_at = NOW() WHERE id = ?',
          [userInfo.oid, user.id]
        );
        user.entra_oid = userInfo.oid;
      }
    }

    // Check if user is active
    if (!user.is_active) {
      return errorResponse('Account is inactive. Please contact your administrator.', 403);
    }

    // Verify auth provider
    if (user.auth_provider !== 'entra') {
      return errorResponse(
        'This account uses local authentication. Please use the email/password login.',
        400
      );
    }

    // Update last login timestamp
    await execute(
      'UPDATE users SET last_login_at = NOW() WHERE id = ?',
      [user.id]
    );

    // Generate JWT tokens for our API
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      authProvider: 'entra' as const,
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
        authProvider: 'entra',
      },
    }, 200);

  } catch (error: any) {
    console.error('Auth callback error:', error);

    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400);
    }

    if (error.message?.includes('authorization code')) {
      return errorResponse('Invalid authorization code', 400);
    }

    return errorResponse('Authentication failed', 500);
  }
}
