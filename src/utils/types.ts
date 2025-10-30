/**
 * Type definitions for Email MFA Platform API
 */

// ============================================
// User and Authentication Types
// ============================================

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  TEAM_MEMBER = 'TEAM_MEMBER',
  CLIENT_USER = 'CLIENT_USER',
}

export type AuthProvider = 'local' | 'entra';

/**
 * User context for authenticated requests
 * Supports hybrid authentication (local + Entra)
 */
export interface UserContext {
  userId: number; // Database user ID
  email: string;
  name?: string;
  role: UserRole; // Single role per user
  authProvider: AuthProvider;
  entraOid?: string; // Azure Entra Object ID (only for SSO users)

  // Legacy fields - will be removed after migration
  entraId?: string; // Deprecated: Use entraOid instead
}

/**
 * Token payload for JWT authentication (local auth)
 */
export interface LocalTokenPayload {
  userId: number;
  email: string;
  role: UserRole;
  authProvider: 'local';
  iat?: number;
  exp?: number;
  iss?: string;
}

/**
 * Token payload for Azure Entra ID (SSO auth)
 */
export interface EntraTokenPayload {
  sub: string; // Entra user ID
  oid: string; // Object ID
  email: string;
  preferred_username?: string;
  name?: string;
  roles?: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

// Legacy type - deprecated
export interface TokenPayload extends LocalTokenPayload {}

// ============================================
// Database Models
// ============================================

export interface Mailbox {
  id: number;
  email_address: string;
  quota_mb: number;
  is_active: boolean;
  created_at: Date;
  created_by: string;
  updated_at: Date;
}

export interface UserMailbox {
  id: number;
  entra_user_id: string;
  entra_email: string;
  mailbox_id: number;
  assigned_at: Date;
  assigned_by: string;
}

export interface UserForwardingRule {
  id: number;
  mailbox_id: number;
  recipient_email: string;
  is_enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface SystemForwardingRule {
  id: number;
  mailbox_id: number;
  recipient_email: string;
  is_enabled: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface WhitelistedSender {
  id: number;
  domain: string;
  added_by: string;
  added_at: Date;
}

export interface WhitelistedRecipient {
  id: number;
  email: string;
  added_by: string;
  added_at: Date;
}

export interface EmailMessage {
  id: number;
  mailbox_id: number;
  message_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text?: string;
  body_html?: string;
  headers: Record<string, any>;
  attachments?: EmailAttachment[];
  received_at: Date;
  s3_key: string;
  s3_bucket: string;
  created_at: Date;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface AuditLogEntry {
  id: number;
  entra_user_id: string;
  user_email: string;
  action: string;
  resource_type?: string;
  resource_id?: number;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListMessagesQuery {
  page?: number;
  pageSize?: number;
  since?: string;
}

export interface CreateForwardingRuleRequest {
  recipientEmail: string;
  isEnabled?: boolean;
}

export interface UpdateForwardingRuleRequest {
  recipientEmail?: string;
  isEnabled?: boolean;
}

export interface ReplyToMessageRequest {
  body: string;
  subject?: string;
}

export interface CreateUserRequest {
  email: string;
  displayName: string;
  role: UserRole;
}

export interface CreateMailboxRequest {
  emailAddress: string;
  quotaMb?: number;
}

export interface AssignMailboxRequest {
  userId: string;
}

export interface AddWhitelistRequest {
  domain?: string;
  email?: string;
}

// ============================================
// Lambda Event Types
// ============================================

/**
 * Context returned by JWT authorizer
 * Populated from validated token (local or Entra)
 */
export interface AuthorizerContext {
  userId: string; // String in authorizer context (converted from number)
  email: string;
  role: string; // String in authorizer context (UserRole enum value)
  authProvider: string; // 'local' or 'entra'
  entraOid?: string; // Optional Entra Object ID

  // Legacy fields - deprecated
  entraId?: string; // Deprecated: Use entraOid instead
  roles?: string; // Deprecated: Use role instead
}

export interface LambdaContext {
  requestContext: {
    authorizer?: AuthorizerContext;
    requestId: string;
    identity: {
      sourceIp: string;
      userAgent: string;
    };
  };
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string;
}

// ============================================
// Email Processing Types
// ============================================

export interface ParsedEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  headers: Record<string, any>;
  attachments: EmailAttachment[];
  receivedAt: Date;
}

export interface ForwardingTarget {
  recipientEmail: string;
  isSystem: boolean;
}

// ============================================
// Configuration Types
// ============================================

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface EntraConfig {
  tenantId: string;
  tenantName: string;
  clientId: string;
  clientSecret: string;
  servicePrincipalClientId: string;
  servicePrincipalClientSecret: string;
  servicePrincipalObjectId: string;
}
