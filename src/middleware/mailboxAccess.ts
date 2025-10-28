import { UserContext } from '../utils/types';
import { queryOne } from '../config/database';
import { isSystemAdmin } from './authorize';

/**
 * Mailbox access control middleware
 */

/**
 * Verify user has access to mailbox
 */
export async function verifyMailboxAccess(
  user: UserContext,
  mailboxId: number
): Promise<boolean> {
  // System admins have access to all mailboxes
  if (isSystemAdmin(user)) {
    return true;
  }

  // Check user-to-mailbox mapping
  const mapping = await queryOne<{ id: number }>(
    `SELECT id FROM user_mailboxes
     WHERE entra_user_id = ? AND mailbox_id = ?`,
    [user.entraId, mailboxId]
  );

  return mapping !== null;
}

/**
 * Require mailbox access (throws error if denied)
 */
export async function requireMailboxAccess(
  user: UserContext,
  mailboxId: number
): Promise<void> {
  const hasAccess = await verifyMailboxAccess(user, mailboxId);

  if (!hasAccess) {
    throw new Error('Access denied. You do not have permission to access this mailbox.');
  }
}

/**
 * Get list of mailbox IDs user has access to
 */
export async function getUserMailboxIds(user: UserContext): Promise<number[]> {
  // System admins see all mailboxes
  if (isSystemAdmin(user)) {
    const mailboxes = await queryOne<{ ids: string }>(
      'SELECT GROUP_CONCAT(id) as ids FROM mailboxes WHERE is_active = 1'
    );
    return mailboxes?.ids ? mailboxes.ids.split(',').map(Number) : [];
  }

  // Regular users see only assigned mailboxes
  const result = await queryOne<{ ids: string }>(
    `SELECT GROUP_CONCAT(mailbox_id) as ids
     FROM user_mailboxes
     WHERE entra_user_id = ?`,
    [user.entraId]
  );

  return result?.ids ? result.ids.split(',').map(Number) : [];
}
