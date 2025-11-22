# Plunk

Open-source email marketing platform built with modern web technologies.

## Self-Hosting with Docker 🐳

The easiest way to run Plunk is with Docker. We provide a single Docker image containing all applications.

### Quick Start (Docker)

```bash
# Download the configuration files
curl -O https://raw.githubusercontent.com/useplunk/plunk/main/docker/docker-compose.self-host.yml
curl -O https://raw.githubusercontent.com/useplunk/plunk/main/.env.self-host.example

# Configure environment variables
cp .env.self-host.example .env
# Edit .env with your settings (see SELF_HOSTING.md for details)

# Start Plunk
docker compose -f docker/docker-compose.self-host.yml up -d

# Access the dashboard at http://localhost:3000
```

**📖 Full Documentation:** See [SELF_HOSTING.md](./SELF_HOSTING.md) for complete setup instructions, configuration options, scaling, and troubleshooting.

## Development Setup

For local development (not using Docker):

### Quick Start

### Prerequisites

- Node.js 20+
- Yarn 4.9+
- Docker & Docker Compose (for local services)

### Development Setup

1. **Clone and install dependencies**

```bash
git clone <repo-url>
cd app
yarn install
```

2. **Start infrastructure services**

```bash
yarn services:up
```

This starts PostgreSQL, Redis, and other required services via Docker Compose.

3. **Set up environment variables**

Copy `.env.example` files in each app and configure:
- `apps/api/.env`
- `apps/web/.env`
- `packages/db/.env`

4. **Run database migrations**

```bash
yarn workspace @repo/db migrate:dev
```

5. **Start development servers**

You need to run **at least two processes** for full functionality:

```bash
# Terminal 1: API Server
yarn workspace api dev

# Terminal 2: Background Worker (REQUIRED for emails/workflows)
yarn workspace api dev:worker

# Terminal 3 (optional): Web App
yarn workspace web dev

# Terminal 4 (optional): Landing Page
yarn workspace landing dev
```

> **⚠️ Important**: The worker process (`dev:worker`) is **required** for:
> - Sending emails (transactional, campaigns, workflows)
> - Processing workflow steps
> - Scheduled campaigns
>
> Without it, emails will be queued but never sent.

## Architecture

This is a Turborepo monorepo with the following structure:

### Apps

- **api** - Express.js API server
  - Main HTTP API
  - Separate worker process for background jobs
- **web** - Next.js web application (Pages Router)
- **landing** - Next.js marketing site (Pages Router)

### Packages

- **@repo/db** - Prisma database schema and client
- **@repo/ui** - Shared UI components (ShadCN + Radix)
- **@repo/shared** - Common utilities and business logic
- **@repo/types** - TypeScript type definitions
- **@repo/email** - React Email templates

## Key Features

- **Email Campaigns** - Send bulk email campaigns to segments
- **Workflows** - Automated email workflows with triggers and conditions
- **Templates** - Reusable email templates with variable substitution
- **Contacts** - Contact management with segmentation
- **Analytics** - Track email opens, clicks, and engagement
- **Domains** - Custom domain verification for email sending

## Technology Stack

- **Frontend**: React 19, Next.js 15, Tailwind CSS
- **Backend**: Express.js, Prisma, BullMQ
- **Database**: PostgreSQL
- **Cache/Queue**: Redis
- **Email**: AWS SES
- **Payments**: Stripe
- **Monitoring**: Sentry, PostHog

## Scripts

### Development

- `yarn dev` - Start all apps in development mode
- `yarn workspace api dev` - Start API server only
- `yarn workspace api dev:worker` - Start background worker only
- `yarn workspace web dev` - Start web app only

### Building

- `yarn build` - Build all apps
- `yarn workspace <app> build` - Build specific app

### Database

- `yarn workspace @repo/db db:generate` - Generate Prisma client
- `yarn workspace @repo/db migrate:dev` - Run migrations (dev)
- `yarn workspace @repo/db migrate:prod` - Deploy migrations (prod)

### Other

- `yarn lint` - Lint all packages
- `yarn clean` - Clean all build artifacts and node_modules
- `yarn services:up` - Start Docker services
- `yarn services:down` - Stop Docker services

## Documentation

- **[SELF_HOSTING.md](./SELF_HOSTING.md)** - 🐳 Self-hosting with Docker (recommended)
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment guide
- [CLAUDE.md](./CLAUDE.md) - Developer guide for Claude Code
- [WORKFLOWS_IMPLEMENTATION.md](./WORKFLOWS_IMPLEMENTATION.md) - Workflow system documentation
- [CAMPAIGNS.md](./CAMPAIGNS.md) - Campaign system documentation

## Environment Variables

See individual `.env.example` files in each app for required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for JWT token signing
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - AWS SES credentials
- `STRIPE_SK` - Stripe secret key

## Production Deployment

**Docker (Recommended)**: See [SELF_HOSTING.md](./SELF_HOSTING.md) for self-hosting with Docker.

**Other Options**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for:
- Kubernetes deployment
- Platform-as-a-Service (Render, Railway, etc.)
- Advanced scaling strategies

## Troubleshooting

### Emails not sending?

Make sure the worker is running: `yarn workspace api dev:worker`

### Database connection errors?

1. Check if PostgreSQL is running: `docker ps`
2. Verify `DATABASE_URL` in your `.env` files
3. Run migrations: `yarn workspace @repo/db migrate:dev`

### Redis connection errors?

1. Check if Redis is running: `docker ps`
2. Verify `REDIS_URL` in your `.env` files

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Submit a pull request

## License

[Your License Here]
