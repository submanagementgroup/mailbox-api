# Mailbox API - Email MFA Platform Backend

**Status**: 🚧 In Development
**Repository**: https://github.com/submanagementgroup/mailbox-api
**Related**: [mailbox-fe](https://github.com/submanagementgroup/mailbox-fe) (Frontend)

Complete backend infrastructure and API for the Email MFA Platform with Azure Entra External ID authentication, role-based access control, and automated email forwarding.

---

## Architecture

### Technology Stack
- **Runtime**: Node.js 20 + TypeScript
- **Compute**: AWS Lambda (15+ functions)
- **API**: API Gateway (REST API with JWT authorizer)
- **Database**: Aurora Serverless V2 MySQL (0.5-4 ACU)
- **Cache**: ElastiCache Redis 7.0 (session management)
- **Email**: SES (send/receive) + S3 (email storage)
- **Auth**: Azure Entra External ID + Microsoft Graph API
- **CI/CD**: AWS CDK with CodePipeline

### Infrastructure Stacks
This repository deploys 3 CDK stacks:

1. **MailboxDbStack** (`lib/mailbox-db-stack.ts`)
   - Aurora Serverless V2 MySQL cluster
   - ElastiCache Redis cluster
   - VPC security groups
   - Secrets Manager for credentials

2. **MailboxEmailStack** (`lib/mailbox-email-stack.ts`)
   - SES domain identity with DKIM
   - S3 bucket for received emails
   - Lambda email processor (parse, store, forward)
   - Sender whitelist enforcement

3. **MailboxApiStack** (`lib/mailbox-api-stack.ts`)
   - API Gateway with custom domain
   - JWT authorizer Lambda
   - 15+ Lambda functions for API routes
   - RBAC enforcement

---

## Project Structure

```
mailbox-api/
├── bin/
│   └── mailbox-api.ts           # CDK pipeline entry point
├── lib/
│   ├── mailbox-db-stack.ts      # Database infrastructure
│   ├── mailbox-email-stack.ts   # Email processing
│   └── mailbox-api-stack.ts     # API Gateway + Lambdas
├── src/                          # Lambda function code
│   ├── handlers/                # Lambda entry points
│   │   ├── listMailboxes.ts
│   │   ├── getMessages.ts
│   │   ├── getMessage.ts
│   │   ├── replyToMessage.ts
│   │   ├── createForwardingRule.ts
│   │   └── createUser.ts
│   ├── services/
│   │   ├── graphService.ts      # Microsoft Graph API
│   │   ├── emailService.ts      # SES + email parsing
│   │   ├── tokenService.ts      # JWT validation
│   │   └── auditLogger.ts       # Audit logging
│   ├── middleware/
│   │   ├── auth.ts              # Authentication
│   │   ├── authorize.ts         # RBAC
│   │   ├── mailboxAccess.ts     # Ownership verification
│   │   └── security.ts          # Security headers
│   ├── config/
│   │   ├── database.ts          # MySQL connection pool
│   │   └── session.ts           # Redis session management
│   └── utils/
│       ├── types.ts             # TypeScript interfaces
│       └── validation.ts        # Zod schemas
├── db/
│   └── schema.sql               # Database schema (8 tables)
├── test/
├── package.json                  # Dependencies (Lambda + CDK)
├── tsconfig.json                 # CDK TypeScript config
├── src/tsconfig.json             # Lambda TypeScript config
├── cdk.json
├── IMPLEMENTATION.md             # Detailed implementation plan
└── README.md                     # This file
```

---

## Local Development

### Prerequisites
- Node.js 20+
- AWS CLI configured
- Docker (for local testing)

### Setup
```bash
# Install dependencies
npm install

# Build Lambda code
npm run build:lambda

# Build CDK code
npm run build

# Run tests
npm test

# Synthesize CDK (validate infrastructure)
npm run synth
```

### Database Setup (Local)
```bash
# Start local MySQL (optional, for testing)
docker run -d \
  --name mailbox-mysql \
  -e MYSQL_ROOT_PASSWORD=local \
  -e MYSQL_DATABASE=email_platform \
  -p 3306:3306 \
  mysql:8.0

# Apply schema
mysql -h 127.0.0.1 -u root -plocal email_platform < db/schema.sql
```

---

## Deployment

### Development Environment
```bash
# Deploy to dev account (484907522964)
git checkout develop
git push origin develop  # Triggers pipeline automatically
```

### Production Environment
```bash
# Deploy to prod account (794038237156)
git checkout main
git push origin main  # Triggers pipeline automatically
```

### Manual Deployment (for testing)
```bash
npm run deploy:dev   # Deploy all stacks to dev
npm run deploy:prod  # Deploy all stacks to prod
```

---

## Database Schema

8 tables supporting email management with RBAC:
- **mailboxes**: Virtual email mailboxes
- **user_mailboxes**: Azure Entra ID → mailbox mapping
- **user_forwarding_rules**: User-managed forwarding (CLIENT_USER can modify)
- **system_forwarding_rules**: Admin-only protected forwarding
- **whitelisted_senders**: Allowed sender domains
- **whitelisted_recipients**: Allowed forwarding recipients
- **email_messages**: Parsed emails from SES
- **audit_log**: Comprehensive audit trail

---

## API Routes

All routes require JWT authentication (Authorization: Bearer token)

### Authentication
- `POST /auth/callback` - OAuth callback (public)
- `POST /auth/logout` - Logout
- `POST /auth/refresh` - Token refresh

### Mailboxes
- `GET /mailboxes` - List user's mailboxes
- `GET /mailboxes/{id}/messages` - List messages (paginated)
- `GET /mailboxes/{id}/messages/{messageId}` - Get message detail
- `POST /mailboxes/{id}/messages/{messageId}/reply` - Reply to message
- `GET /mailboxes/{id}/forwarding` - List forwarding rules
- `POST /mailboxes/{id}/forwarding` - Create forwarding rule
- `PUT /mailboxes/{id}/forwarding/{ruleId}` - Update rule
- `DELETE /mailboxes/{id}/forwarding/{ruleId}` - Delete rule

### Admin (SYSTEM_ADMIN role required)
- `GET /admin/users` - List users
- `POST /admin/users` - Create user (Graph API)
- `GET /admin/whitelist/senders` - List whitelisted senders
- `POST /admin/whitelist/senders` - Add whitelisted sender
- `GET /admin/audit-log` - View audit log

---

## Role-Based Access Control

### Three Roles (defined in Azure Entra External ID):

1. **SYSTEM_ADMIN**
   - Full platform access
   - Create/delete users (Graph API)
   - Manage system forwarding rules (protected)
   - Access all mailboxes
   - Manage whitelists
   - View audit log

2. **TEAM_MEMBER**
   - Access assigned client mailboxes
   - View and reply to emails
   - Cannot modify system rules

3. **CLIENT_USER**
   - Access only their mailboxes
   - View and reply to emails
   - Manage user forwarding rules
   - Cannot access admin functions

---

## Configuration

### Required Environment Variables
Set in AWS Secrets Manager and passed to Lambda functions:

- `DB_HOST` - Aurora endpoint
- `DB_NAME` - Database name (email_platform)
- `DB_SECRET_ARN` - Secrets Manager ARN for DB credentials
- `REDIS_HOST` - ElastiCache endpoint
- `REDIS_PORT` - Redis port
- `ENVIRONMENT` - dev or prod

### Azure Entra External ID
Required for deployment (stored in Secrets Manager):
- Tenant ID
- Tenant name
- Client ID
- Client secret
- Service principal credentials

---

## Local Development

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/submanagementgroup/mailbox-api.git
cd mailbox-api

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local

# 4. Get database password from AWS Secrets Manager
npm run get-db-password
# Copy the password and add to .env.local as DB_PASSWORD

# 5. Start local development server
npm run dev

# Server runs at http://localhost:3001 with hot-reload
```

### Local Development Server

The local development server (`npm run dev`) runs an Express wrapper around Lambda handlers:

**Features**:
- ✅ Hot-reload: Edit handlers and save → Server auto-restarts
- ✅ Real AWS services: Connects to deployed Aurora, Redis, SES, S3
- ✅ Mock auth: Bypasses Azure Entra (user: matt@submanagementgroup.com)
- ✅ CORS enabled for frontend at localhost:3000
- ✅ All routes available

**How it works**:
- Wraps Lambda handlers as Express routes
- Uses `ts-node-dev` for automatic TypeScript compilation and restart
- Reads `.env.local` for environment variables
- Mocks Lambda event structure from Express request
- Returns Lambda response as Express JSON

**Environment Setup**:

```bash
# .env.local (required variables)
DB_HOST=dev-mailbox-api-deployment-d-auroracluster23d869c0-qicpu0y8rf5e.cluster-cby4imkui7pd.ca-central-1.rds.amazonaws.com
DB_PORT=3306
DB_NAME=email_platform
DB_USERNAME=mailadmin
DB_PASSWORD=<from-secrets-manager>  # Run: npm run get-db-password
DB_SECRET_ARN=arn:aws:secretsmanager:ca-central-1:484907522964:secret:dev/mail-platform/db-xYLUF7

REDIS_HOST=dev-mail-redis.gzoje6.0001.cac1.cache.amazonaws.com
REDIS_PORT=6379

AWS_REGION=ca-central-1
EMAIL_BUCKET=dev-mailbox-emails-484907522964

ENVIRONMENT=local
NODE_ENV=development
```

### Available Endpoints

When running `npm run dev`, test with curl or your frontend:

```bash
# Health check
curl http://localhost:3001/health

# List mailboxes (mock SYSTEM_ADMIN user)
curl http://localhost:3001/mailboxes

# Get messages
curl http://localhost:3001/mailboxes/1/messages

# Get single message
curl http://localhost:3001/mailboxes/1/messages/1

# Reply to message
curl -X POST http://localhost:3001/mailboxes/1/messages/1/reply \
  -H "Content-Type: application/json" \
  -d '{"body": "Test reply", "subject": "Re: Test"}'

# Create forwarding rule
curl -X POST http://localhost:3001/mailboxes/1/forwarding \
  -H "Content-Type: application/json" \
  -d '{"recipientEmail": "user@example.com", "isEnabled": true}'

# Create user (admin)
curl -X POST http://localhost:3001/admin/users \
  -H "Content-Type: application/json" \
  -d '{"email": "newuser@example.com", "displayName": "New User", "role": "CLIENT_USER"}'
```

### Hot-Reload Workflow

1. Edit any file in `src/handlers/`, `src/services/`, `src/middleware/`
2. Save the file
3. Server automatically restarts (~1 second)
4. Test your changes immediately

**Example**:
```bash
# Edit src/handlers/listMailboxes.ts
# Save file
# Console shows: [INFO] Restarting 'local-server.ts'
# Test: curl http://localhost:3001/mailboxes
```

### Development with Frontend

Run both frontend and backend simultaneously:

```bash
# Terminal 1: Backend API
cd mailbox-api
npm run dev

# Terminal 2: Frontend
cd mailbox-fe
npm start

# Frontend (localhost:3000) → Backend (localhost:3001) → AWS Services
```

### Authentication in Local Mode

**Dev Mode Bypass**:
- Frontend shows "Dev Login" button (no Azure Entra)
- Click to log in as matt@submanagementgroup.com (SYSTEM_ADMIN)
- Backend accepts `DEV_TOKEN_BYPASS` token when `ENVIRONMENT=local`
- All features testable without Azure setup

**Production Mode**:
- Remove `ENVIRONMENT=local` from .env
- Normal Azure Entra JWT validation

### Database Access

The local server connects to **deployed Aurora** (not local MySQL):

**Why?**
- Real data for testing
- No Docker setup needed
- Actual schema and migrations
- Test with real SES emails

**Direct Database Access**:
```bash
# Get database password
npm run get-db-password

# Connect via MySQL client
mysql -h dev-mailbox-api-deployment-d-auroracluster23d869c0-qicpu0y8rf5e.cluster-cby4imkui7pd.ca-central-1.rds.amazonaws.com \
  -u mailadmin \
  -p email_platform

# Or use TablePlus, DBeaver, etc.
```

### Troubleshooting

**"Cannot connect to database"**:
- Verify you're on VPN or have VPC access
- Check security group allows your IP
- Verify DB_PASSWORD is correct

**"Module not found" errors**:
- Run `npm install` again
- Clear node_modules: `rm -rf node_modules && npm install`

**Changes not reloading**:
- Check console for TypeScript errors
- Restart: Ctrl+C and `npm run dev`
- Verify `ts-node-dev` is running

---

## Testing

```bash
# Run unit tests
npm test

# Test specific handler
npm test -- handlers/listMailboxes.test.ts

# Lint code
npm run lint
```

---

## Detailed Implementation Plan

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for complete commit-by-commit implementation history, architecture decisions, and detailed specifications.

---

## Related Repositories

- **Frontend**: [mailbox-fe](https://github.com/submanagementgroup/mailbox-fe) - React UI
- **Types** (future): mailbox-types - Shared TypeScript definitions

---

**Maintainer**: Sub Management Group
**License**: UNLICENSED (Private)
