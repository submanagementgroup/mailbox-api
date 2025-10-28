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
