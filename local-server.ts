#!/usr/bin/env node
import express from 'express';
import cors from 'cors';

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
    const { handler } = await import('./src/handlers/listMailboxes');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/mailboxes/:mailboxId/messages', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/getMessages');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/mailboxes/:mailboxId/messages/:messageId', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/getMessage');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/mailboxes/:mailboxId/messages/:messageId/reply', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/replyToMessage');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
    const { handler } = await import('./src/handlers/createForwardingRule');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin routes
app.post('/admin/users', async (req, res) => {
  try {
    const { handler } = await import('./src/handlers/createUser');
    const result = await handler(createLambdaEvent(req));
    sendLambdaResponse(res, result);
  } catch (error: any) {
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
