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
// - createMailbox
// - assignMailbox
// - listWhitelistedSenders
// - addWhitelistedSender
// - getAuditLog
//
// These follow the same pattern and can be added as needed
