# Mailbox API - Email MFA Platform Backend

**Status**: 🚧 In Development

Node.js/TypeScript Lambda-based API backend for the Email MFA Platform.

## Stack
- Node.js 20
- TypeScript
- AWS Lambda
- API Gateway
- Aurora MySQL (mysql2)
- ElastiCache Redis (ioredis)
- Azure Entra External ID (MSAL)
- Microsoft Graph API

## Structure

```
src/
├── handlers/     # Lambda function handlers (one per API route)
├── services/     # Business logic (Graph API, Email, Tokens, Audit)
├── middleware/   # Auth, RBAC, mailbox access verification
├── config/       # Database and session configuration
└── utils/        # Types and validation schemas
```

## Development

```bash
npm install
npm run build
npm test
```

## Deployment

Deployed via AWS CDK pipeline from main infrastructure repository.

---

Part of the SMG Email MFA Platform ecosystem.
Related repositories:
- Infrastructure: [smg/funding/mail](https://github.com/submanagementgroup/smg/tree/main/funding/mail)
- Frontend: [mailbox-fe](https://github.com/submanagementgroup/mailbox-fe)

Full documentation will be added after testing and deployment.
