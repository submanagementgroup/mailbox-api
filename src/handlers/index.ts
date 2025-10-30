/**
 * Export all Lambda function handlers
 * Each handler is deployed as a separate Lambda function via API Gateway
 */

// Mailbox handlers
export { handler as listMailboxes } from './listMailboxes';
export { handler as getMessages } from './getMessages';
export { handler as getMessage } from './getMessage';
export { handler as replyToMessage } from './replyToMessage';

// Forwarding rule handlers
export { handler as createForwardingRule } from './createForwardingRule';

// Admin handlers
export { handler as createUser } from './createUser';
export { handler as createMailbox } from './createMailbox';

// Whitelist handlers
export { handler as addWhitelistSender } from './addWhitelistSender';
export { handler as deleteWhitelistSender } from './deleteWhitelistSender';

// Additional handlers implemented as placeholders:
// - listForwardingRules
// - updateForwardingRule
// - deleteForwardingRule
// - authCallback
// - logout
// - tokenRefresh
// - listUsers
// - deleteUser
// - resetPassword
// - assignMailbox
// - listWhitelistedSenders (GET /admin/whitelist/senders)
// - getAuditLog
//
// These follow the same pattern and can be added as needed
