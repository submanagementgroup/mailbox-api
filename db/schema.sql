-- ================================================================
-- Database: email_platform
-- Email MFA Platform Database Schema
-- ================================================================

-- ============================================
-- Mailboxes
-- ============================================
CREATE TABLE IF NOT EXISTS mailboxes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email_address VARCHAR(255) UNIQUE NOT NULL,
  quota_mb INT DEFAULT 5120,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) COMMENT 'Entra user ID',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email_address),
  INDEX idx_active (is_active),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Virtual mailboxes for email receiving';

-- ============================================
-- User-to-Mailbox Mapping (Azure Entra)
-- ============================================
CREATE TABLE IF NOT EXISTS user_mailboxes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  entra_user_id VARCHAR(255) NOT NULL COMMENT 'Azure Entra External ID user ID',
  entra_email VARCHAR(255) NOT NULL,
  mailbox_id INT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by VARCHAR(255) COMMENT 'Entra ID of admin who assigned',
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_mailbox (entra_user_id, mailbox_id),
  INDEX idx_entra_user (entra_user_id),
  INDEX idx_mailbox (mailbox_id),
  INDEX idx_assigned_at (assigned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Maps Azure Entra users to mailboxes';

-- ============================================
-- User-Managed Forwarding Rules
-- ============================================
CREATE TABLE IF NOT EXISTS user_forwarding_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mailbox_id INT NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255) NOT NULL COMMENT 'Entra user ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
  INDEX idx_mailbox (mailbox_id),
  INDEX idx_enabled (is_enabled),
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User-managed forwarding rules (CLIENT_USER can modify)';

-- ============================================
-- System-Managed Forwarding Rules (Protected)
-- ============================================
CREATE TABLE IF NOT EXISTS system_forwarding_rules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  mailbox_id INT NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_by VARCHAR(255) COMMENT 'Entra user ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
  INDEX idx_mailbox (mailbox_id),
  INDEX idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System-managed forwarding rules (admin-only, protected)';

-- ============================================
-- Whitelisted Sender Domains
-- ============================================
CREATE TABLE IF NOT EXISTS whitelisted_senders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  domain VARCHAR(255) UNIQUE NOT NULL,
  added_by VARCHAR(255) COMMENT 'Entra user ID',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_domain (domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Allowed sender domains for receiving email';

-- ============================================
-- Whitelisted Forwarding Recipients
-- ============================================
CREATE TABLE IF NOT EXISTS whitelisted_recipients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  added_by VARCHAR(255) COMMENT 'Entra user ID',
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Allowed forwarding recipient emails';

-- ============================================
-- Email Messages (Parsed from SES)
-- ============================================
CREATE TABLE IF NOT EXISTS email_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  mailbox_id INT NOT NULL,
  message_id VARCHAR(255) NOT NULL COMMENT 'Email Message-ID header',
  from_address VARCHAR(500) NOT NULL,
  to_address VARCHAR(500) NOT NULL,
  subject VARCHAR(998) COMMENT 'RFC 5322 max subject length',
  body_text MEDIUMTEXT COMMENT 'Plain text body',
  body_html MEDIUMTEXT COMMENT 'HTML body',
  headers JSON COMMENT 'All email headers',
  attachments JSON COMMENT 'Attachment metadata',
  received_at TIMESTAMP NOT NULL,
  s3_key VARCHAR(1024) NOT NULL COMMENT 'S3 key for raw email',
  s3_bucket VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id) ON DELETE CASCADE,
  INDEX idx_mailbox_received (mailbox_id, received_at DESC),
  INDEX idx_message_id (message_id),
  INDEX idx_from (from_address(255)),
  INDEX idx_received_at (received_at DESC),
  FULLTEXT INDEX ft_subject (subject),
  FULLTEXT INDEX ft_body (body_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parsed email messages from SES';

-- ============================================
-- Audit Log
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  entra_user_id VARCHAR(255),
  user_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) COMMENT 'mailbox, message, forwarding_rule, etc.',
  resource_id BIGINT COMMENT 'ID of affected resource',
  details JSON COMMENT 'Additional action details',
  ip_address VARCHAR(45) COMMENT 'IPv4 or IPv6 address',
  user_agent VARCHAR(500),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_timestamp (entra_user_id, timestamp DESC),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Comprehensive audit trail';

-- ============================================
-- Initial Data
-- ============================================

-- Default whitelisted sender (canadacouncil.ca)
INSERT IGNORE INTO whitelisted_senders (domain, added_by)
VALUES ('canadacouncil.ca', 'system');

-- Additional common MFA sender domains (can be added by admins)
INSERT IGNORE INTO whitelisted_senders (domain, added_by)
VALUES
  ('cca.gc.ca', 'system'),
  ('gc.ca', 'system');

-- ============================================
-- Database Info
-- ============================================
-- Version: 1.0.0
-- Last Updated: 2025-01-28
-- Purpose: Email MFA Platform with RBAC and audit trail
