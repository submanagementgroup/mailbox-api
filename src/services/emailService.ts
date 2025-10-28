import { SESClient, SendEmailCommand, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { simpleParser, ParsedMail } from 'mailparser';
import { ParsedEmail } from '../utils/types';

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
