#!/usr/bin/env node
import express = require('express');
import cors = require('cors');

/**
 * Local development server
 * Wraps Lambda handlers as Express routes for hot-reload development
 */

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Mock user context (SYSTEM_ADMIN for testing all features)
const mockAuthContext = {
  entraId: 'local-dev-user-id',
  email: 'dev@localhost',
  name: 'Local Developer',
  roles: JSON.stringify(['SYSTEM_ADMIN']),
};

// Helper to create Lambda event from Express request
function createLambdaEvent(req: express.Request): any {
  return {
    requestContext: {
      authorizer: mockAuthContext,
      requestId: `local-${Date.now()}`,
      identity: {
        sourceIp: req.ip || '127.0.0.1',
        userAgent: req.get('user-agent') || 'local-dev',
      },
    },
    headers: req.headers,
    pathParameters: req.params,
    queryStringParameters: req.query,
    body: req.body ? JSON.stringify(req.body) : null,
  };
}

// Helper to send Lambda response
function sendLambdaResponse(res: express.Response, lambdaResult: any) {
  const statusCode = lambdaResult.statusCode || 200;
  const body = lambdaResult.body ? JSON.parse(lambdaResult.body) : {};
  const headers = lambdaResult.headers || {};

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value as string);
  });

  res.status(statusCode).json(body);
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Local development server running',
    timestamp: new Date().toISOString(),
  });
});

// Mailbox routes
app.get('/mailboxes', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/listMailboxes.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in /mailboxes:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get('/mailboxes/:mailboxId/messages', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/getMessages.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in /mailboxes/:mailboxId/messages:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get('/mailboxes/:mailboxId/messages/:messageId', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/getMessage.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in /mailboxes/:mailboxId/messages/:messageId:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.post('/mailboxes/:mailboxId/messages/:messageId/reply', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/replyToMessage.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in reply endpoint:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get('/mailboxes/:mailboxId/forwarding', async (req, res) => {
  try {
    // Placeholder - implement when handler is created
    res.json({ data: [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/mailboxes/:mailboxId/forwarding', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/createForwardingRule.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in create forwarding rule:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Admin routes
app.get('/admin/users', async (req, res) => {
  try {
    const { queryRows } = await import('./src/config/database.ts');
    const users = await queryRows(`
      SELECT DISTINCT
        entra_user_id as id,
        entra_email as email,
        'SYSTEM_ADMIN' as role,
        assigned_at as created_at
      FROM user_mailboxes
      ORDER BY assigned_at DESC
    `);
    res.json({ data: users });
  } catch (error: any) {
    console.error('Error in list users:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/users', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/createUser.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in create user:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.get('/admin/mailboxes', async (req, res) => {
  try {
    const { queryRows } = await import('./src/config/database.ts');
    const mailboxes = await queryRows(`
      SELECT
        id,
        email_address,
        quota_mb,
        used_mb,
        is_active,
        created_at,
        created_by
      FROM mailboxes
      ORDER BY created_at DESC
    `);
    res.json({ data: mailboxes });
  } catch (error: any) {
    console.error('Error in list mailboxes:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/mailboxes', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/createMailbox.ts');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    console.error('Error in create mailbox:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

app.delete('/admin/mailboxes/:id', async (req, res) => {
  try {
    const { query } = await import('./src/config/database.ts');
    const mailboxId = parseInt(req.params.id);

    if (isNaN(mailboxId)) {
      res.status(400).json({ error: 'Invalid mailbox ID' });
      return;
    }

    // Delete the mailbox (cascades to email_messages, user_mailboxes, and forwarding rules)
    const [result] = await query('DELETE FROM mailboxes WHERE id = ?', [mailboxId]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Mailbox not found' });
      return;
    }

    res.json({ success: true, message: 'Mailbox deleted successfully' });
  } catch (error: any) {
    console.error('Error in delete mailbox:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/whitelist/senders', async (req, res) => {
  try {
    const { queryRows } = await import('./src/config/database.ts');
    const senders = await queryRows(`
      SELECT
        id,
        domain,
        added_by,
        added_at
      FROM whitelisted_senders
      ORDER BY added_at DESC
    `);
    res.json({ data: senders });
  } catch (error: any) {
    console.error('Error in whitelist senders:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/whitelist/senders', async (req, res) => {
  try {
    // Placeholder - implement whitelist handler
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in add whitelist sender:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/audit-log', async (req, res) => {
  try {
    const { queryRows, query } = await import('./src/config/database.ts');
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const offset = (page - 1) * pageSize;

    const [totalResult] = await query('SELECT COUNT(*) as count FROM audit_log');
    const total = totalResult[0].count;

    const logs = await queryRows(`
      SELECT
        id,
        entra_user_id,
        user_email,
        action,
        resource_type,
        resource_id,
        ip_address,
        user_agent,
        timestamp
      FROM audit_log
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `, [pageSize, offset]);

    res.json({
      data: logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error: any) {
    console.error('Error in audit log:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 Local Development Server Started');
  console.log('=====================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log('\nMocked Auth: SYSTEM_ADMIN (all permissions)');
  console.log('\nConnecting to:');
  console.log(`  Database: ${process.env.DB_HOST || 'Not configured'}`);
  console.log(`  Redis: ${process.env.REDIS_HOST || 'Not configured'}`);
  console.log('\nHot-reload enabled - edit handlers and save to reload');
  console.log('=====================================\n');
});
