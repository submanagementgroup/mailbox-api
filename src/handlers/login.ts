import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { queryRows } from '../config/database';
import { z } from 'zod';
import { validateInput, successResponse, errorResponse } from '../utils/responses';

/**
 * Smart login endpoint
 * POST /auth/login
 *
 * Auto-detects authentication method based on email domain:
 * - @submanagementgroup.com → Azure Entra SSO (Enterprise App)
 * - Other domains → Local authentication (email/password)
 *
 * Returns auth method and redirect URL for SSO or proceeds with local auth
 */

const checkEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().optional(),
});

interface UserRecord {
  id: number;
  email: string;
  auth_provider: 'local' | 'entra';
  is_active: boolean;
}

/**
 * Determine auth provider based on email domain
 */
function getAuthProviderForEmail(email: string): 'local' | 'entra' {
  const domain = email.split('@')[1]?.toLowerCase();

  // SSO for @submanagementgroup.com
  if (domain === 'submanagementgroup.com') {
    return 'entra';
  }

  // Local auth for all other domains
  return 'local';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Parse and validate request body
    const body = event.body ? JSON.parse(event.body) : {};
    const input = validateInput(checkEmailSchema, body);

    // Look up user by email
    const users = await queryRows<UserRecord>(
      `SELECT id, email, auth_provider, is_active
       FROM users
       WHERE email = ?`,
      [input.email]
    );

    // Determine expected auth provider based on email domain
    const expectedProvider = getAuthProviderForEmail(input.email);

    // If user exists, verify auth provider matches
    if (users.length > 0) {
      const user = users[0];

      // Check if user is active
      if (!user.is_active) {
        return errorResponse('Account is inactive. Please contact your administrator.', 403);
      }

      // Return auth method for frontend
      if (user.auth_provider === 'entra') {
        // SSO flow - return redirect URL for Azure Entra
        const entraClientId = process.env.ENTRA_CLIENT_ID;
        const entraAuthority = process.env.ENTRA_AUTHORITY;
        const redirectUri = process.env.ENTRA_REDIRECT_URI;

        if (!entraClientId || !entraAuthority || !redirectUri) {
          return errorResponse('SSO configuration error', 500);
        }

        // Build Azure Entra authorization URL
        const authUrl = `${entraAuthority}/oauth2/v2.0/authorize?` +
          `client_id=${entraClientId}&` +
          `response_type=code&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_mode=query&` +
          `scope=openid%20profile%20email&` +
          `state=${encodeURIComponent(JSON.stringify({ email: input.email }))}`;

        return successResponse({
          authMethod: 'entra',
          authUrl,
          message: 'Please complete SSO authentication',
        }, 200);
      }

      // Local auth flow - password required
      if (user.auth_provider === 'local') {
        if (!input.password) {
          return successResponse({
            authMethod: 'local',
            requiresPassword: true,
            message: 'Password required for local authentication',
          }, 200);
        }

        // Delegate to local login handler
        // (In production, this would be a Lambda function invoke or internal redirect)
        return errorResponse('Use /auth/login/local endpoint for local authentication', 400);
      }
    }

    // User not found - return expected auth method based on domain
    if (expectedProvider === 'entra') {
      return errorResponse(
        'Account not found. Please contact your administrator to create an account.',
        404
      );
    }

    // For local auth domains, user must be created by admin first
    return errorResponse(
      'Account not found. Please contact your administrator to create an account.',
      404
    );

  } catch (error: any) {
    console.error('Smart login error:', error);

    if (error.name === 'ZodError') {
      return errorResponse(error.errors[0].message, 400);
    }

    return errorResponse('Authentication check failed', 500);
  }
}
