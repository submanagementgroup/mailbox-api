import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { simpleParser, ParsedMail } from 'mailparser';
import { ParsedEmail } from '../utils/types';
import { queryRows } from '../config/database';
import { matchesDomainPattern } from '../utils/validation';

/**
 * Email service for sending and parsing emails
 */

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ca-central-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ca-central-1' });

/**
 * Parse email from S3
 */
export async function parseEmailFromS3(bucket: string, key: string): Promise<ParsedEmail> {
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!response.Body) {
    throw new Error('Email body is empty');
  }

  const emailBuffer = await streamToBuffer(response.Body as any);
  const parsed = await simpleParser(emailBuffer);

  return {
    messageId: parsed.messageId || '',
    from: parsed.from?.text || '',
    to: parsed.to?.text || '',
    subject: parsed.subject || '',
    textBody: parsed.text,
    htmlBody: parsed.html ? String(parsed.html) : undefined,
    headers: parsed.headers as any,
    attachments: (parsed.attachments || []).map(att => ({
      filename: att.filename || 'unnamed',
      contentType: att.contentType,
      size: att.size,
    })),
    receivedAt: parsed.date || new Date(),
  };
}

/**
 * Send email via SES
 */
export async function sendEmail(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<string> {
  const command = new SendEmailCommand({
    Source: params.from,
    Destination: { ToAddresses: [params.to] },
    Message: {
      Subject: { Data: params.subject },
      Body: { Text: { Data: params.body } },
    },
    ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
  });

  const response = await sesClient.send(command);
  return response.MessageId || '';
}

/**
 * Helper: Convert stream to buffer
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Send temporary password email to a new user
 * @param email - User's email address
 * @param temporaryPassword - Generated temporary password
 * @param userName - User's display name (optional)
 * @returns Promise resolving to message ID
 */
export async function sendTemporaryPasswordEmail(
  email: string,
  temporaryPassword: string,
  userName?: string
): Promise<string> {
  const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@submanagementgroup.com';

  const greeting = userName ? `Hello ${userName}` : 'Hello';

  const subject = 'Your Email MFA Platform Account';

  const body = `${greeting},

Your account has been created on the Email MFA Platform.

Your temporary login credentials:
Email: ${email}
Password: ${temporaryPassword}

IMPORTANT: You must change this password after your first login.

To access your account:
1. Go to the Email MFA Platform login page
2. Enter your email address
3. Enter the temporary password above
4. You will be prompted to create a new password

Security tips:
- Your new password must be at least 12 characters long
- Include uppercase, lowercase, numbers, and special characters
- Never share your password with anyone
- Change your password immediately if you suspect it has been compromised

If you did not request this account or have any questions, please contact your system administrator.

Best regards,
Email MFA Platform Team
`;

  return sendEmail({
    from: fromEmail,
    to: email,
    subject,
    body,
  });
}

/**
 * Check if a sender email address is whitelisted
 * Supports wildcard patterns: *.gc.ca, *canadacouncil.ca
 *
 * @param senderEmail - Full email address (e.g., "user@cca.gc.ca")
 * @returns true if the sender's domain matches any whitelisted pattern
 *
 * @example
 * await isSenderWhitelisted("user@cca.gc.ca") // true if *.gc.ca is whitelisted
 * await isSenderWhitelisted("user@historycanadacouncil.ca") // true if *canadacouncil.ca is whitelisted
 */
export async function isSenderWhitelisted(senderEmail: string): Promise<boolean> {
  // Extract domain from email address
  const domain = senderEmail.split('@')[1];
  if (!domain) {
    return false;
  }

  // Fetch all whitelisted sender patterns from database
  const whitelistedPatterns = await queryRows<{ domain: string }>(
    'SELECT domain FROM whitelisted_senders'
  );

  // Check if sender domain matches any whitelisted pattern
  for (const pattern of whitelistedPatterns) {
    if (matchesDomainPattern(domain, pattern.domain)) {
      return true;
    }
  }

  return false;
}
