/**
 * Type definitions for Email MFA Platform API
 */

// ============================================
// User and Authentication Types
// ============================================

export interface UserContext {
  entraId: string;
  email: string;
  name?: string;
  roles: string[];
}

export enum UserRole {
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
  TEAM_MEMBER = 'TEAM_MEMBER',
  CLIENT_USER = 'CLIENT_USER',
}

export interface TokenPayload {
  sub: string; // Entra user ID
  email: string;
  name?: string;
  roles?: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

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

export interface AuthorizerContext {
  entraId: string;
  email: string;
  roles: string;
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
