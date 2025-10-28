import { UserContext, UserRole } from '../utils/types';

/**
 * Role-Based Access Control (RBAC) middleware
 */

/**
 * Check if user has required role
 */
export function hasRole(user: UserContext, ...allowedRoles: string[]): boolean {
  return user.roles.some(role => allowedRoles.includes(role));
}

/**
 * Require specific role(s)
 */
export function requireRole(user: UserContext, ...allowedRoles: string[]): void {
  if (!hasRole(user, ...allowedRoles)) {
    throw new Error(`Access denied. Required role: ${allowedRoles.join(' or ')}`);
  }
}

/**
 * Check if user is system admin
 */
export function isSystemAdmin(user: UserContext): boolean {
  return user.roles.includes(UserRole.SYSTEM_ADMIN);
}

/**
 * Check if user is team member or admin
 */
export function isTeamMemberOrAdmin(user: UserContext): boolean {
  return hasRole(user, UserRole.SYSTEM_ADMIN, UserRole.TEAM_MEMBER);
}

/**
 * Check if user is client user
 */
export function isClientUser(user: UserContext): boolean {
  return user.roles.includes(UserRole.CLIENT_USER);
}

/**
 * Require system admin role
 */
export function requireAdmin(user: UserContext): void {
  if (!isSystemAdmin(user)) {
    throw new Error('Access denied. Admin privileges required.');
  }
}

/**
 * Require team member or admin role
 */
export function requireTeamAccess(user: UserContext): void {
  if (!isTeamMemberOrAdmin(user)) {
    throw new Error('Access denied. Team member or admin privileges required.');
  }
}

/**
 * Handle authorization errors
 */
export function handleAuthorizationError(error: any): { statusCode: number; body: string } {
  console.error('Authorization error:', error);

  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      error: 'Forbidden',
      message: error.message || 'Access denied',
    }),
  };
}
