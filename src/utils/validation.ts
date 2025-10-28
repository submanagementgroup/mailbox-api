import { z } from 'zod';

/**
 * Zod validation schemas for API requests
 */

// ============================================
// User Management Schemas
// ============================================

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['SYSTEM_ADMIN', 'TEAM_MEMBER', 'CLIENT_USER']),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// ============================================
// Mailbox Schemas
// ============================================

export const createMailboxSchema = z.object({
  emailAddress: z.string().email('Invalid email address'),
  quotaMb: z.number().int().positive().max(10240).optional().default(5120),
});

export type CreateMailboxInput = z.infer<typeof createMailboxSchema>;

export const assignMailboxSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export type AssignMailboxInput = z.infer<typeof assignMailboxSchema>;

// ============================================
// Forwarding Rule Schemas
// ============================================

export const createForwardingRuleSchema = z.object({
  recipientEmail: z.string().email('Invalid recipient email'),
  isEnabled: z.boolean().optional().default(true),
});

export type CreateForwardingRuleInput = z.infer<typeof createForwardingRuleSchema>;

export const updateForwardingRuleSchema = z.object({
  recipientEmail: z.string().email('Invalid recipient email').optional(),
  isEnabled: z.boolean().optional(),
}).refine(data => data.recipientEmail !== undefined || data.isEnabled !== undefined, {
  message: 'At least one field must be provided',
});

export type UpdateForwardingRuleInput = z.infer<typeof updateForwardingRuleSchema>;

// ============================================
// Message Schemas
// ============================================

export const replyToMessageSchema = z.object({
  body: z.string().min(1, 'Body is required').max(10000, 'Body too long'),
  subject: z.string().max(998, 'Subject too long').optional(),
});

export type ReplyToMessageInput = z.infer<typeof replyToMessageSchema>;

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(50),
  since: z.string().datetime().optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// ============================================
// Whitelist Schemas
// ============================================

export const addWhitelistSenderSchema = z.object({
  domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid domain format'),
});

export type AddWhitelistSenderInput = z.infer<typeof addWhitelistSenderSchema>;

export const addWhitelistRecipientSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type AddWhitelistRecipientInput = z.infer<typeof addWhitelistRecipientSchema>;

// ============================================
// Validation Utility Functions
// ============================================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function validateInputSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function formatValidationError(error: z.ZodError): string {
  return error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
}
