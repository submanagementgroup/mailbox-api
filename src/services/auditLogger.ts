import { insert } from '../config/database';

/**
 * Audit logging service
 */

export interface AuditLogParams {
  entraUserId: string;
  userEmail: string;
  action: string;
  resourceType?: string;
  resourceId?: number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await insert(
      `INSERT INTO audit_log
       (entra_user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.entraUserId,
        params.userEmail,
        params.action,
        params.resourceType || null,
        params.resourceId || null,
        params.details ? JSON.stringify(params.details) : null,
        params.ipAddress || null,
        params.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging failure shouldn't break the request
  }
}

/**
 * Predefined audit actions
 */
export const AuditAction = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESH: 'TOKEN_REFRESH',

  // User Management
  CREATE_USER: 'CREATE_USER',
  DELETE_USER: 'DELETE_USER',
  RESET_PASSWORD: 'RESET_PASSWORD',

  // Mailbox Management
  CREATE_MAILBOX: 'CREATE_MAILBOX',
  DELETE_MAILBOX: 'DELETE_MAILBOX',
  ASSIGN_MAILBOX: 'ASSIGN_MAILBOX',
  UNASSIGN_MAILBOX: 'UNASSIGN_MAILBOX',
  VIEW_MAILBOX: 'VIEW_MAILBOX',

  // Message Operations
  VIEW_MESSAGES: 'VIEW_MESSAGES',
  VIEW_MESSAGE: 'VIEW_MESSAGE',
  SEND_REPLY: 'SEND_REPLY',

  // Forwarding Rules
  CREATE_FORWARDING_RULE: 'CREATE_FORWARDING_RULE',
  UPDATE_FORWARDING_RULE: 'UPDATE_FORWARDING_RULE',
  DELETE_FORWARDING_RULE: 'DELETE_FORWARDING_RULE',
  CREATE_SYSTEM_FORWARDING_RULE: 'CREATE_SYSTEM_FORWARDING_RULE',
  DELETE_SYSTEM_FORWARDING_RULE: 'DELETE_SYSTEM_FORWARDING_RULE',

  // Whitelist Management
  ADD_WHITELISTED_SENDER: 'ADD_WHITELISTED_SENDER',
  REMOVE_WHITELISTED_SENDER: 'REMOVE_WHITELISTED_SENDER',
  ADD_WHITELISTED_RECIPIENT: 'ADD_WHITELISTED_RECIPIENT',
  REMOVE_WHITELISTED_RECIPIENT: 'REMOVE_WHITELISTED_RECIPIENT',

  // Email Processing
  EMAIL_RECEIVED: 'EMAIL_RECEIVED',
  EMAIL_FORWARDED: 'EMAIL_FORWARDED',
  EMAIL_REJECTED: 'EMAIL_REJECTED',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];
