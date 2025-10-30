import { UserContext, UserRole, AuthProvider } from '../utils/types';

/**
 * Authentication middleware for hybrid auth (local + Entra)
 */

export interface AuthenticatedRequest {
  user: UserContext;
  requestContext: any;
}

/**
 * Extract and validate user context from Lambda event
 * Works with both local JWT tokens and Azure Entra tokens
 */
export async function authenticate(event: any): Promise<UserContext> {
  // Get user context from authorizer (API Gateway already validated token)
  if (event.requestContext?.authorizer) {
    const auth = event.requestContext.authorizer;

    // New hybrid auth format
    if (auth.userId && auth.role && auth.authProvider) {
      return {
        userId: parseInt(auth.userId, 10),
        email: auth.email,
        name: auth.name,
        role: auth.role as UserRole,
        authProvider: auth.authProvider as AuthProvider,
        entraOid: auth.entraOid,
        // Legacy field for backward compatibility
        entraId: auth.entraOid || auth.entraId,
      };
    }

    // Legacy format (for backward compatibility during migration)
    if (auth.entraId || auth.principalId) {
      console.warn('Using legacy authorizer context format - update to hybrid auth');
      return {
        userId: parseInt(auth.userId || '0', 10), // Default to 0 if missing
        email: auth.email,
        name: auth.name,
        role: UserRole.SYSTEM_ADMIN, // Default role for legacy
        authProvider: 'entra',
        entraId: auth.entraId || auth.principalId,
        entraOid: auth.entraId || auth.principalId,
      };
    }
  }

  // Dev mode bypass for local testing
  if (process.env.ENVIRONMENT === 'local') {
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (authHeader?.includes('DEV_TOKEN_BYPASS')) {
      console.log('🔓 Dev mode: Bypassing authentication');
      return {
        userId: 1,
        email: 'matt@submanagementgroup.com',
        name: 'Matt Chadburn (Dev Mode)',
        role: UserRole.SYSTEM_ADMIN,
        authProvider: 'local',
      };
    }
  }

  throw new Error('Unauthorized');
}

/**
 * Check if user has admin role (SYSTEM_ADMIN or TEAM_MEMBER)
 */
export function isAdmin(user: UserContext): boolean {
  return user.role === UserRole.SYSTEM_ADMIN || user.role === UserRole.TEAM_MEMBER;
}

/**
 * Check if user has system admin role
 */
export function isSystemAdmin(user: UserContext): boolean {
  return user.role === UserRole.SYSTEM_ADMIN;
}

/**
 * Require admin role or throw error
 */
export function requireAdmin(user: UserContext): void {
  if (!isAdmin(user)) {
    throw new Error('Admin access required');
  }
}

/**
 * Require system admin role or throw error
 */
export function requireSystemAdmin(user: UserContext): void {
  if (!isSystemAdmin(user)) {
    throw new Error('System admin access required');
  }
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
