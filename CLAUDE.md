# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plunk is a Turborepo monorepo containing multiple applications and shared packages for a platform service. The project
uses Yarn workspaces with Node.js 20+ requirement.

## Scale & Performance Requirements

**CRITICAL**: This service operates at high scale with approximately **1 million contacts added monthly**. All code changes must consider:

- **Database Performance**: Queries must be optimized for large datasets (1M+ rows). Avoid N+1 queries, use proper indexes, and prefer cursor-based pagination over offset-based.
- **Memory Efficiency**: Never load large datasets into memory. Always use streaming or batch processing with reasonable limits.
- **Asynchronous Operations**: Heavy computations (counts, aggregations, bulk updates) should be offloaded to background jobs via BullMQ, not executed synchronously in API requests.
- **Caching Strategy**: Frequently accessed computed values should be cached or stored as materialized data to avoid repeated expensive queries.
- **Query Optimization**: Be mindful of JSON field queries (Contact.data) - these require GIN indexes. Test query plans with EXPLAIN ANALYZE.
- **API Response Times**: Target < 200ms for read operations, < 500ms for write operations. Use timeouts and circuit breakers.

When implementing features that query or process contacts, segments, or campaigns:
1. Always consider performance with 1M+ contacts
2. Use pagination with reasonable defaults (20-100 items)
3. Implement background jobs for bulk operations
4. Add database indexes for new query patterns
5. Cache computed values that don't need real-time accuracy

## Development Commands

### Environment Setup

- **Start services**: `yarn services:up` - Starts PostgreSQL, Redis, and Browserless via Docker Compose
- **Build shared packages**: `yarn build --filter="@repo/shared"` - Required before running apps

### Development

- **Start all apps**: `yarn dev` - Starts all apps including API server and worker process
- **Start specific app**: `yarn dev --filter="<app-name>"` (e.g., `yarn dev --filter="web"`)
- **Start API only (server)**: `yarn workspace api dev:server` - API server without worker
- **Start API only (worker)**: `yarn workspace api dev:worker` - Worker process only
- **Build all**: `yarn build`
- **Lint all**: `yarn lint`
- **Clean all**: `yarn clean` - Removes node_modules, .turbo, and build artifacts

**Note**: The API's `dev` script automatically runs both the server and worker process using `concurrently`. If you need to run them separately (e.g., for debugging), use `dev:server` and `dev:worker` individually.

### Database (Prisma)

- **Generate client**: `yarn workspace @repo/db db:generate`
- **Run migrations (dev)**: `yarn workspace @repo/db migrate:dev`
- **Deploy migrations (prod)**: `yarn workspace @repo/db migrate:prod`

## Architecture

### Applications (`apps/`)

- **api**: Express.js API server with TypeScript (ESM), uses @overnightjs/core
  - HTTP API endpoints for the platform
  - Background cron jobs (workflow processor, domain verification)
  - **Worker process** (separate): BullMQ worker for processing email, campaign, and workflow queues
- **web**: Next.js app (Pages Router) - Main platform (app.useplunk.com)
- **landing**: Next.js app (Pages Router) - Marketing site (www.useplunk.com)
- **wiki**: Next.js app - Documentation site (docs.useplunk.com)

### Background Job Architecture

The API uses BullMQ (backed by Redis) for asynchronous job processing:

- **API Server** creates jobs and adds them to queues (email, campaign, workflow)
- **Worker Process** (`apps/api/src/jobs/worker.ts`) consumes jobs from queues
- Jobs are processed with retry logic, rate limiting, and concurrency control
- Worker runs separately for scalability and fault isolation (can scale workers independently)

See [DEPLOYMENT.md](DEPLOYMENT.md) for production deployment guidance.

### Shared Packages (`packages/`)

- **@repo/db**: Prisma schema and client
- **@repo/ui**: ShadCN-based UI library with Radix UI + Tailwind
- **@repo/shared**: Common utilities and business logic
- **@repo/types**: TypeScript type definitions
- **@repo/email**: React-email templates
- **@repo/notifications**: Notification system

## Key Technologies

- **Frontend**: React 19, Next.js 15.3, Tailwind CSS, Framer Motion
- **Backend**: Express.js, Prisma, Redis (ioredis), Stripe
- **UI Library**: Radix UI primitives, ShadCN components
- **Authentication**: JWT with bcrypt

## Code Standards

### Import Organization

ESLint enforces import order: builtin → external → internal → parent → sibling with alphabetical sorting and newlines
between groups.

### TypeScript

- Consistent type imports preferred: `import type { ... }`
- Unused vars allowed with `_` prefix
- Strict type checking enabled across all packages

### Component Structure

- UI components in `packages/ui/src/components/`
- App-specific components in `apps/<app>/src/components/`
- Atomic design pattern: atoms → molecules hierarchy

## Environment Variables

Required for builds and deployment (see turbo.json and .env.self-host.example):

**Build Time:**
- Database: `DATABASE_URL`, `DIRECT_DATABASE_URL` (for Prisma client generation)
- Standard: `NODE_ENV`

**Runtime:**
- Security: `JWT_SECRET`
- Database: `DATABASE_URL`, `DIRECT_DATABASE_URL`
- Infrastructure: `REDIS_URL`
- **Application URLs** (injected at runtime into Next.js apps): `API_URI`, `DASHBOARD_URI`, `LANDING_URI`, `WIKI_URI` (optional)
- AWS S3: `AWS_CLOUDFRONT_DISTRIBUTION_ID`, `AWS_S3_ACCESS_KEY_ID`, `AWS_S3_ACCESS_KEY_SECRET`, `AWS_S3_BUCKET`
- AWS SES: `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET`, `SES_CONFIGURATION_SET_NO_TRACKING`
- OAuth (optional): `GITHUB_OAUTH_CLIENT`, `GITHUB_OAUTH_SECRET`, `GOOGLE_OAUTH_CLIENT`, `GOOGLE_OAUTH_SECRET`
- Stripe (optional): `STRIPE_SK`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ONBOARDING`, `STRIPE_PRICE_EMAIL_USAGE`, `STRIPE_METER_EVENT_NAME`
- Internal: `PLUNK_API_KEY` (for @repo/email package)

**Important Note on Runtime URL Configuration:**
The application URLs (`API_URI`, `DASHBOARD_URI`, etc.) are injected at Docker container startup into Next.js apps via generated `__env.js` files. This allows the same Docker image to be used across different environments (development, staging, production) by simply changing environment variables at runtime. In development, these fall back to `NEXT_PUBLIC_*` environment variables for backward compatibility.

## Cursor Rules

Project includes Cursor IDE rules in `.cursor/rules/` covering:

- Project structure guidelines
- UI component patterns
- Task management workflows
- Quantity change handling patterns