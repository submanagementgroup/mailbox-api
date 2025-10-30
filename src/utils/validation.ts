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
  emailAddress: z.string().email('Invalid email address').refine((email) => {
    const allowedDomain = process.env.MAILBOX_DOMAIN || 'funding.dev.submanagementgroup.com';
    const domain = email.split('@')[1];
    return domain === allowedDomain;
  }, {
    message: `Email must be from domain ${process.env.MAILBOX_DOMAIN || 'funding.dev.submanagementgroup.com'}`,
  }),
  // quotaMb removed - all mailboxes are 20GB (20480 MB)
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
  domain: z.string().regex(
    /^(\*\.?)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i,
    'Invalid domain format. Allowed: domain.com, *.domain.com, *domain.com'
  ),
});

export type AddWhitelistSenderInput = z.infer<typeof addWhitelistSenderSchema>;

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

// ============================================
// Domain Matching Utility
// ============================================

/**
 * Check if a sender domain matches a whitelist pattern with wildcard support
 *
 * @param senderDomain - The sender's domain (e.g., "cca.gc.ca", "historycanadacouncil.ca")
 * @param whitelistPattern - The whitelist pattern (e.g., "*.gc.ca", "*canadacouncil.ca", "example.com")
 * @returns true if the sender domain matches the whitelist pattern
 *
 * @example
 * matchesDomainPattern("cca.gc.ca", "*.gc.ca") // true
 * matchesDomainPattern("gc.ca", "*.gc.ca") // false (*.  requires a subdomain)
 * matchesDomainPattern("historycanadacouncil.ca", "*canadacouncil.ca") // true
 * matchesDomainPattern("canadacouncil.ca", "*canadacouncil.ca") // true
 * matchesDomainPattern("example.com", "example.com") // true (exact match)
 */
export function matchesDomainPattern(senderDomain: string, whitelistPattern: string): boolean {
  const sender = senderDomain.toLowerCase();
  const pattern = whitelistPattern.toLowerCase();

  // Wildcard subdomain pattern: *.domain.com
  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.substring(2); // Remove "*."
    // Must end with .baseDomain (requires at least one subdomain level)
    return sender.endsWith('.' + baseDomain) && sender !== baseDomain;
  }

  // Wildcard prefix pattern: *domain.com (no dot after asterisk)
  if (pattern.startsWith('*')) {
    const suffix = pattern.substring(1); // Remove "*"
    // Must end with the suffix (can be exact match or have prefix)
    return sender.endsWith(suffix);
  }

  // Exact match
  return sender === pattern;
}
