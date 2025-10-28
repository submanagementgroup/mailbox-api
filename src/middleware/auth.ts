import { UserContext } from '../utils/types';
import { validateToken, extractUserContext } from '../services/tokenService';

/**
 * Authentication middleware
 */

export interface AuthenticatedRequest {
  user: UserContext;
  requestContext: any;
}

/**
 * Extract and validate token from Lambda event
 */
export async function authenticate(event: any): Promise<UserContext> {
  // Try to get user context from authorizer first (API Gateway already validated)
  if (event.requestContext?.authorizer) {
    const auth = event.requestContext.authorizer;
    return {
      entraId: auth.entraId || auth.principalId,
      email: auth.email,
      name: auth.name,
      roles: auth.roles ? JSON.parse(auth.roles) : [],
    };
  }

  // Fallback: Extract token from Authorization header
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader) {
    throw new Error('No authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    throw new Error('Invalid authorization header format');
  }

  // Validate token
  const payload = await validateToken(token);
  return extractUserContext(payload);
}

/**
 * Handle authentication errors
 */
export function handleAuthError(error: any): { statusCode: number; body: string } {
  console.error('Authentication error:', error);

  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: 'Unauthorized',
      message: error.message || 'Authentication failed',
    }),
  };
}
