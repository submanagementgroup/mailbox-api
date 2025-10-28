# Email MFA Platform - Implementation Plan

**Last Updated**: 2025-01-28
**Status**: ✅ Commits 1-8 Complete - Repos Fully Independent
**Repository**: mailbox-api (Backend Infrastructure & Lambda API)
**Related Repo**: [mailbox-fe](https://github.com/submanagementgroup/mailbox-fe) (Frontend)

## GitHub Repository Strategy ✅ FULLY IMPLEMENTED (Option 1)

Following **Conductor pattern**, each repository is **completely self-contained** with its own CDK infrastructure:

### 1. Frontend Repository: `submanagementgroup/mailbox-fe` ✅ INDEPENDENT
   - **GitHub**: https://github.com/submanagementgroup/mailbox-fe
   - **Contains**:
     - React 19 app (src/, public/)
     - CDK infrastructure (bin/, lib/)
     - Own pipeline (develop → dev, main → prod)
   - **Deploys**: S3 bucket + CloudFront distribution
   - **Domain**: mail.dev.submanagementgroup.com (dev), mail.submanagementgroup.com (prod)
   - **Status**: ✅ Complete with CDK pipeline

### 2. Backend Repository: `submanagementgroup/mailbox-api` ✅ INDEPENDENT
   - **GitHub**: https://github.com/submanagementgroup/mailbox-api
   - **Contains**:
     - Lambda code (src/)
     - Database schema (db/schema.sql)
     - CDK infrastructure (bin/, lib/)
     - Own pipeline (develop → dev, main → prod)
   - **Deploys**: Aurora, Redis, SES, API Gateway, Lambda functions
   - **Status**: ✅ Complete with CDK pipeline

### Local Development Setup:
The two repos can be cloned side-by-side for convenience:
```bash
mkdir mailbox-platform
cd mailbox-platform
git clone https://github.com/submanagementgroup/mailbox-fe.git
git clone https://github.com/submanagementgroup/mailbox-api.git
```

This matches the Conductor pattern where `/conduktr/` is just a local directory containing independent repos.

### Development Workflow:
```bash
# Clone repos independently:
git clone https://github.com/submanagementgroup/mailbox-fe.git
git clone https://github.com/submanagementgroup/mailbox-api.git

# Work on frontend:
cd mailbox-fe/
npm install
npm start  # React dev server
npm run deploy:dev  # Deploy frontend to AWS

# Work on backend:
cd mailbox-api/
npm install
npm run build
npm run deploy:dev  # Deploy backend to AWS
```

### Deployment:
- **mailbox-fe**: Push to GitHub → Pipeline builds React → Deploys to S3+CloudFront
- **mailbox-api**: Push to GitHub → Pipeline builds Lambda → Deploys Aurora+API Gateway+Lambda

Each repo has its own CodePipeline triggered by GitHub pushes.

---

## Project Overview

A complete email MFA interception platform for managing client email-based Multi-Factor Authentication flows with secure access control and automated forwarding.

### Architecture Summary
- **Frontend**: React 19 + Material-UI v7 (S3 + CloudFront)
- **Backend**: AWS Lambda + API Gateway (TypeScript/Node.js 20)
- **Authentication**: Azure Entra External ID with RBAC (3 roles)
- **Database**: Aurora Serverless V2 MySQL
- **Cache**: ElastiCache Redis (session management)
- **Email**: SES receive → S3 → Lambda processor → Aurora storage
- **CI/CD**: AWS CDK with pipelines (@submanagementgroup/cdk-pipelines-client)

### Environments
- **Development**
  - Account: 484907522964
  - Region: ca-central-1
  - Domain: mail.dev.submanagementgroup.com
  - Branch: develop
- **Production**
  - Account: 794038237156
  - Region: ca-central-1
  - Domain: mail.submanagementgroup.com
  - Branch: main

---

## Project Structure ✅ RESTRUCTURED TO INDEPENDENT REPOS

**IMPORTANT**: Following **Option 1 (Conductor pattern)** - each repository is fully self-contained with its own CDK infrastructure:
- **mailbox-fe**: Independent React app with own CDK pipeline (like conductor-fe) ✅
- **mailbox-api**: Independent Lambda API with own CDK pipeline (like conductor-api) ✅
- **smg/funding/mail**: DEPRECATED - infrastructure moved to individual repos

```
/Users/mattjc/Projects/smg/funding/mail/
├── PLAN.md                    # This file - master tracking document
├── README.md                 # Project documentation
│
├── mailbox-fe/               # 🎨 FRONTEND (like conductor-fe)
│   ├── public/              # Static assets, branding
│   ├── src/                 # React components, pages, hooks
│   ├── package.json         # React, MUI, MSAL dependencies
│   ├── tsconfig.json        # Frontend TypeScript config
│   └── README.md
│
├── mailbox-api/             # ⚙️ BACKEND API (like conductor-api)
│   ├── src/
│   │   ├── handlers/        # Lambda handlers
│   │   ├── services/        # Graph, Email, DB services
│   │   ├── middleware/      # Auth, RBAC, validation
│   │   ├── config/          # DB, session config
│   │   └── utils/           # Utilities, types
│   ├── db/
│   │   └── schema.sql       # Database schema
│   ├── layers/              # Lambda layers
│   ├── package.json         # AWS SDK, mysql2, ioredis dependencies
│   ├── tsconfig.json        # Backend TypeScript config
│   └── README.md
│
├── bin/
│   └── mail.ts              # 🚀 CDK pipeline entry point
├── lib/
│   ├── mailbox-db-stack.ts  # Aurora + Redis
│   ├── mailbox-email-stack.ts # SES + Lambda processor
│   ├── mailbox-api-stack.ts # API Gateway + Lambdas
│   └── mailbox-fe-stack.ts  # S3 + CloudFront
├── test/
│   └── *.test.ts            # Stack tests
│
├── package.json             # 📦 CDK dependencies only
├── tsconfig.json            # CDK config (excludes mailbox-fe, mailbox-api)
├── cdk.json
├── jest.config.js
└── .gitignore
```

**Build Process**:
1. **Frontend**: `cd mailbox-fe && npm ci && npm run build` → `mailbox-fe/build/`
2. **Backend**: `cd mailbox-api && npm ci && npm run build` → `mailbox-api/dist/`
3. **CDK**: `npm ci && npm run build && npx cdk synth`

Each project (app, backend, infrastructure) can be developed, tested, and built independently.

---

## Implementation Progress

### Commit 1: Initialize master plan and update CDK foundation ✅ COMPLETED
- [x] Create PLAN.md (this document)
- [x] Update package.json with Portal dependencies
- [x] Update tsconfig.json with Portal patterns
- [x] Enhance .gitignore with Portal patterns
- [x] Add proper npm scripts
- [x] Commit changes

### Commit 2: Implement CDK pipeline architecture ✅ COMPLETED
- [x] Rewrite bin/mail.ts with PipelineStack
- [x] Configure dev pipeline (develop → 484907522964)
- [x] Configure prod pipeline (main → 794038237156)
- [x] Add custom synth commands for React build
- [x] Configure CodeConnections
- [x] Add environment-specific context
- [x] Add proper tagging (Component: mail, Environment: dev/prod)
- [x] Update MailStack props (targetEnvironment, domainName)
- [x] Update tests for both environments
- [x] Commit changes

### Commit 3: Create database infrastructure stack ✅ COMPLETED
- [x] Create lib/mailbox-db-stack.ts (renamed following Conductor pattern)
- [x] Define Aurora Serverless V2 cluster
  - Dev: 0.5-1 ACU, single writer, 7-day backup
  - Prod: 1-4 ACU, writer + reader, 30-day backup, deletion protection
- [x] Define ElastiCache Redis 7.0
  - Dev: cache.t3.micro, 1-day snapshot
  - Prod: cache.t3.small, 7-day snapshot
- [x] Create security groups (database, Redis, Lambda)
- [x] VPC lookup (imports existing Portal/Conductor VPC)
- [x] Create Secrets Manager secret for database credentials
- [x] Add CloudWatch log exports (error, general, slowquery)
- [x] Create comprehensive database schema (mailbox-api/db/schema.sql)
  - mailboxes, user_mailboxes, forwarding rules, whitelists, email_messages, audit_log
- [x] Simplify naming: mailbox-be → mailbox-api (following conductor-api pattern)
- [x] Finalize structure: mailbox-fe/ and mailbox-api/ only
- [x] Commit changes

### Commit 4: Create email infrastructure stack ✅ COMPLETED
- [x] Create lib/mailbox-email-stack.ts
- [x] Configure SES domain identity + DKIM for mail.*.submanagementgroup.com
- [x] Create S3 bucket for received emails (encrypted, 90-day lifecycle)
- [x] Create Lambda email processor function (Node.js 20, VPC-connected)
- [x] Configure S3 event notifications → Lambda
- [x] Grant SES permission to write to S3 bucket
- [x] Add placeholder implementation (full logic in Commit 7)
- [x] Provide AWS CLI command for SES receipt rule setup
- [x] Commit changes

### Commit 5: Implement API Gateway and Lambda infrastructure ✅ COMPLETED
- [x] Create lib/mailbox-api-stack.ts
- [x] Define API Gateway REST API (regional, throttling, CORS)
- [x] Create JWT authorizer Lambda (Azure Entra validation placeholder)
- [x] Define 15+ Lambda functions for all routes:
  - Auth routes (callback, logout, token refresh)
  - Mailbox routes (list, get messages, reply)
  - Forwarding routes (list, create, update, delete)
  - Admin routes (users, whitelist, audit log)
- [x] Create Lambda layer for shared dependencies (placeholder)
- [x] Configure VPC access for all functions (Aurora + Redis)
- [x] Add environment variables (DB credentials, Redis endpoint)
- [x] Grant Secrets Manager access to all functions
- [x] Configure CloudWatch log retention (1 month)
- [x] Add placeholder implementations (full logic in Commits 6-7)
- [x] Commit changes

### Commit 6: Implement backend API code structure ✅ COMPLETED
- [x] Create mailbox-api/ directory with package.json (20+ dependencies)
- [x] Create TypeScript configuration (CommonJS, Lambda-optimized)
- [x] Implement src/services/:
  - graphService.ts (Microsoft Graph API placeholders)
  - emailService.ts (SES send, S3 email parsing with mailparser)
  - tokenService.ts (JWT validation placeholders)
  - auditLogger.ts (complete with 25+ audit action types)
- [x] Implement src/middleware/:
  - auth.ts (authenticate, handleAuthError)
  - authorize.ts (RBAC with 3-role enforcement)
  - mailboxAccess.ts (ownership verification, admin bypass)
  - security.ts (security headers, error handling)
- [x] Implement src/config/:
  - database.ts (MySQL pool, query helpers, Secrets Manager integration)
  - session.ts (Redis with ioredis, session CRUD operations)
- [x] Create src/utils/:
  - types.ts (40+ TypeScript interfaces for all models/APIs)
  - validation.ts (Zod schemas for all inputs, validation helpers)
- [x] Commit changes

### Commit 7: Implement Lambda function handlers ✅ COMPLETED
- [x] Create mailbox-api/src/handlers/ directory
- [x] Implement key handlers following consistent pattern:
  - listMailboxes.ts - List accessible mailboxes with role-based filtering
  - getMessages.ts - Paginated message list with Zod validation
  - getMessage.ts - Single message detail with full body
  - replyToMessage.ts - Send reply via SES with Reply-To headers
  - createForwardingRule.ts - Create rule with whitelist enforcement
  - createUser.ts - Admin-only Graph API user creation
- [x] Consistent handler pattern:
  - Authenticate → Authorize → Validate → Execute → Audit → Respond
  - Error handling with standardized responses
  - Security headers on all responses
  - CORS configured
- [x] All handlers use:
  - Middleware for auth, RBAC, mailbox access
  - Zod schemas for input validation
  - Database query helpers with connection pooling
  - Audit logging for compliance
  - Typed responses with TypeScript interfaces
- [x] Additional handlers documented in index.ts (can be added following same pattern)
- [x] Commit changes

### Commit 8: Restructure to independent repositories (Option 1) ✅ COMPLETED
- [x] Create mailbox-fe/ with React 19 (Create React App + TypeScript)
- [x] Install dependencies: Material-UI v7, MSAL, axios, react-router-dom
- [x] Copy SMG branding assets (smg-logo.png, smg-logo-small.png)
- [x] Create environment configs (aws-exports.dev.ts, aws-exports.prod.ts)
- [x] **Created GitHub repositories:**
  - ✅ submanagementgroup/mailbox-fe
  - ✅ submanagementgroup/mailbox-api
- [x] **Added CDK infrastructure to mailbox-fe:**
  - bin/mailbox-fe.ts (pipeline for S3+CloudFront deployment)
  - lib/mailbox-fe-stack.ts (frontend deployment stack)
  - package.json (React + CDK dependencies)
  - tsconfig.cdk.json (CDK TypeScript config)
  - cdk.json, jest.config.js, .gitignore
- [x] **Added CDK infrastructure to mailbox-api:**
  - bin/mailbox-api.ts (pipeline for backend deployment)
  - lib/ (moved 3 stacks: db, email, api)
  - package.json (Lambda + CDK dependencies)
  - tsconfig.json (CDK config), src/tsconfig.json (Lambda config)
  - cdk.json, jest.config.js, .gitignore
- [x] Pushed mailbox-fe to GitHub (2 commits)
- [x] Pushed mailbox-api to GitHub (2 commits)
- [x] Both repos now fully self-contained like conductor-fe and conductor-api
- [x] Updated PLAN.md with new architecture (Option 1)

### Commit 9: Implement React authentication and routing
- [ ] Create src/lib/msalConfig.ts (MSAL browser config)
- [ ] Create src/lib/api.ts (axios client with interceptor)
- [ ] Implement src/hooks/:
  - useAuth.ts (authentication hook)
  - useApi.ts (API call hook)
  - useMailboxes.ts
  - useMessages.ts
- [ ] Create src/components/auth/:
  - AuthGuard.tsx (route protection)
  - LoginButton.tsx
  - UserMenu.tsx
- [ ] Create src/components/layout/:
  - Layout.tsx (main wrapper)
  - Header.tsx (with SMG branding, user menu)
  - Sidebar.tsx (navigation based on role)
- [ ] Setup routing in src/App.tsx
- [ ] Add MSAL provider in src/index.tsx
- [ ] Commit changes

### Commit 10: Implement core React components
- [ ] Create src/pages/Dashboard.tsx (mailbox list)
- [ ] Create src/pages/Mailbox.tsx (inbox view)
- [ ] Create src/pages/Message.tsx (detail view)
- [ ] Create src/pages/Forwarding.tsx (rules management)
- [ ] Implement src/components/mailbox/:
  - MailboxList.tsx
  - MessageList.tsx (Material-UI DataGrid)
  - MessageDetail.tsx (HTML iframe for email body)
  - ReplyForm.tsx (with validation)
- [ ] Implement src/components/forwarding/:
  - ForwardingRuleList.tsx
  - ForwardingRuleForm.tsx
  - SystemRulesList.tsx (read-only)
- [ ] Add loading states and error handling
- [ ] Add snackbar notifications
- [ ] Implement responsive design
- [ ] Commit changes

### Commit 11: Implement admin dashboard
- [ ] Create src/pages/admin/ directory:
  - AdminDashboard.tsx
  - Users.tsx
  - Mailboxes.tsx
  - Whitelist.tsx
  - AuditLog.tsx
- [ ] Implement src/components/admin/:
  - UserList.tsx (with role badges)
  - CreateUserDialog.tsx (Graph API)
  - MailboxList.tsx
  - CreateMailboxDialog.tsx
  - AssignMailboxDialog.tsx
  - WhitelistManager.tsx (tabs for senders/recipients)
  - AuditLogViewer.tsx (with filters, date range)
- [ ] Add admin-only route guards
- [ ] Implement data tables with sorting/filtering
- [ ] Add confirmation dialogs
- [ ] Commit changes

### Commit 12: Frontend deployment and documentation
- [ ] Create lib/frontend-stack.ts
- [ ] Define S3 bucket (private, KMS encrypted)
- [ ] Define CloudFront distribution:
  - Origin Access Control (OAC)
  - ACM certificate (ca-central-1 for ALB, us-east-1 for CloudFront)
  - Custom domain configuration
  - Error responses (403/404 → /index.html for SPA routing)
  - Cache policies
- [ ] Add Route53 A record (mail.*.submanagementgroup.com)
- [ ] Add BucketDeployment with React build
- [ ] Configure CloudFront invalidation
- [ ] Update cdk.json with custom synth:
  ```bash
  cd app && npm ci && npm run build && cd .. && npm ci && npm run build && npx cdk synth
  ```
- [ ] Update PLAN.md with completion status
- [ ] Create comprehensive README.md
- [ ] Create backend/README.md (API documentation)
- [ ] Create app/README.md (frontend setup)
- [ ] Commit changes

---

## Key Technologies

### CDK Infrastructure
- **aws-cdk-lib**: 2.202.0 (matching Portal)
- **@submanagementgroup/cdk-pipelines-client**: 1.9.0
- **constructs**: ^10.0.0
- **TypeScript**: ~5.6.3

### Backend (Lambda Functions)
- **Runtime**: Node.js 20
- **Language**: TypeScript 5.6+
- **Database**: mysql2 (Aurora MySQL connection)
- **Cache**: ioredis (Redis client)
- **Auth**: @azure/msal-node, express-jwt, jwks-rsa
- **Graph API**: @microsoft/microsoft-graph-client
- **Email**: @aws-sdk/client-ses, mailparser
- **Validation**: zod
- **Testing**: jest, ts-jest

### Frontend (React SPA)
- **Framework**: React 19
- **Router**: react-router-dom v7
- **UI**: Material-UI v7 (@mui/material, @mui/icons-material)
- **Auth**: @azure/msal-browser
- **HTTP**: axios
- **Build**: react-scripts (Create React App)
- **TypeScript**: 5.6+

---

## Database Schema

### Tables Created in Aurora MySQL

#### `mailboxes`
- Stores virtual mailbox configurations
- Fields: id, email_address, quota_mb, is_active, created_at, created_by

#### `user_mailboxes`
- Maps Azure Entra users to mailboxes
- Fields: id, entra_user_id, entra_email, mailbox_id, assigned_at, assigned_by

#### `user_forwarding_rules`
- User-managed forwarding rules (can be modified by CLIENT_USER)
- Fields: id, mailbox_id, recipient_email, is_enabled, created_by, created_at

#### `system_forwarding_rules`
- System-managed forwarding rules (admin-only, protected)
- Fields: id, mailbox_id, recipient_email, is_enabled, created_by, created_at

#### `whitelisted_senders`
- Allowed sender domains for receiving email
- Fields: id, domain, added_by, added_at

#### `whitelisted_recipients`
- Allowed recipient emails for forwarding
- Fields: id, email, added_by, added_at

#### `email_messages`
- Parsed and stored emails from SES
- Fields: id, mailbox_id, message_id, from_address, to_address, subject, body_text, body_html, received_at, s3_key

#### `audit_log`
- Comprehensive audit trail
- Fields: id, entra_user_id, user_email, action, resource_type, resource_id, details (JSON), ip_address, user_agent, timestamp

---

## RBAC - Three Roles

### SYSTEM_ADMIN
- **Full platform access**
- Create/delete users via Microsoft Graph API
- Manage system forwarding rules (protected)
- Access all mailboxes
- Manage whitelists (senders/recipients)
- View complete audit log
- Assign/unassign mailboxes to users

### TEAM_MEMBER
- **Internal staff role**
- Access assigned client mailboxes
- View and reply to emails
- Cannot modify system forwarding rules
- Cannot create users or manage whitelists

### CLIENT_USER
- **External client role**
- Access only their assigned mailboxes
- View and reply to emails
- Manage their own user forwarding rules
- Cannot access system forwarding rules
- Cannot access admin functions

---

## Email Flow

1. **Receive**: Email arrives at mail.submanagementgroup.com
2. **SES Receipt Rule**: Check sender domain against `whitelisted_senders` table
3. **Store**: If whitelisted, save raw email to S3 bucket
4. **Process**: S3 event triggers Lambda processor
5. **Parse**: Lambda uses mailparser to extract email data
6. **Database**: Store parsed email in `email_messages` table
7. **Forward**: Lambda checks `user_forwarding_rules` and `system_forwarding_rules`
8. **Whitelist Check**: Validate forwarding recipients against `whitelisted_recipients`
9. **Send**: Forward via SES to approved recipients
10. **Display**: User views email in React frontend via API Gateway → Lambda → Aurora query

---

## Required Configuration (Before Deployment)

### Azure Entra External ID
- [ ] Tenant ID
- [ ] Tenant name (e.g., yourcompany.ciamlogin.com)
- [ ] Client ID (application registration)
- [ ] Client secret
- [ ] Service principal client ID
- [ ] Service principal object ID
- [ ] App roles configured (SYSTEM_ADMIN, TEAM_MEMBER, CLIENT_USER)

### AWS Resources
- [ ] ACM certificate for mail.dev.submanagementgroup.com (ca-central-1)
- [ ] ACM certificate for mail.submanagementgroup.com (ca-central-1)
- [ ] ACM certificate for CloudFront (us-east-1) - if using CloudFront custom domain
- [ ] Production CodeConnection ARN (dev ARN: arn:aws:codeconnections:ca-central-1:484907522964:connection/64a3746c-a26c-410a-8acc-1741c50813be)
- [ ] Mail receiving domain (e.g., clients.submanagementgroup.com)
- [ ] SES production access approval (remove sandbox)

### Initial Data
- [ ] Default whitelisted sender: canadacouncil.ca
- [ ] First SYSTEM_ADMIN user in Entra External ID

---

## Success Criteria

- [ ] React app deploys to S3+CloudFront via CDK pipeline
- [ ] Users authenticate via Azure Entra External ID
- [ ] JWT tokens validated on every API request
- [ ] RBAC enforced (3 roles with proper permissions)
- [ ] Emails received via SES and stored in Aurora
- [ ] Forwarding rules execute automatically
- [ ] Whitelist enforcement (sender domains, recipient emails)
- [ ] Reply functionality via SES with proper headers
- [ ] Admin can create users via Microsoft Graph API
- [ ] Admin can assign mailboxes to users
- [ ] Audit log captures all actions with user/IP/timestamp
- [ ] Responsive UI works on mobile/tablet/desktop
- [ ] CloudWatch monitoring and alarms configured
- [ ] No unauthorized access possible
- [ ] Session management via Redis
- [ ] All secrets in AWS Secrets Manager

---

## Cost Estimate (Monthly - CAD)

### Development Environment
- Lambda (1M requests): ~$5
- API Gateway (1M requests): ~$4
- Aurora Serverless V2 (0.5-1 ACU): ~$25
- ElastiCache Redis (t3.micro): ~$15
- S3 (email storage + frontend): ~$2
- CloudFront: ~$5
- SES ($0.10/1000): ~$1
- **Total Dev**: ~$57/month

### Production Environment
- Lambda (10M requests): ~$30
- API Gateway (10M requests): ~$35
- Aurora Serverless V2 (1-4 ACU): ~$80
- ElastiCache Redis (t3.small): ~$30
- S3 (email storage + frontend): ~$10
- CloudFront: ~$20
- SES: ~$10
- **Total Prod**: ~$215/month

**Total (Dev + Prod)**: ~$272/month

---

## Timeline

- **Commits 1-2** (Infrastructure Foundation): 1 day
- **Commits 3-5** (AWS Resources): 2 days
- **Commits 6-7** (Backend API): 3 days
- **Commits 8-11** (React Frontend): 4 days
- **Commit 12** (Deployment + Docs): 1 day

**Total Estimated Time**: ~11 days (2 weeks with testing)

---

## Notes

- This plan will be updated after each commit to track progress
- Each commit should be self-contained and deployable
- Testing should occur after each major component
- Follow Portal and conductor-fe patterns for consistency
- Prioritize security at every layer
- Document all configuration requirements
- Ensure proper error handling throughout

---

**Status Legend**:
- ✅ Completed
- 🔄 In Progress
- ⏳ Pending
- ⚠️ Blocked
- ❌ Failed

---

*Last commit: Setting up project foundation (Commit 1)*
