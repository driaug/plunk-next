# Self-Hosting Plunk

This guide will help you self-host Plunk on your own infrastructure using Docker.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Scaling](#scaling)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Overview

Plunk is distributed as a single Docker image containing all applications:

- **API Server** - HTTP API endpoints (port 8080)
- **Worker** - Background job processor for emails and campaigns
- **Web Dashboard** - Main application UI (port 3000)
- **Landing Page** - Marketing website (port 4000) [optional]
- **Documentation** - Wiki site (port 1000) [optional]

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Plunk Stack                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │   API    │  │  Worker  │  │   Web    │            │
│  │  :8080   │  │ (BullMQ) │  │  :3000   │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │             │              │                   │
│       └─────────────┴──────────────┘                   │
│                     │                                   │
│       ┌─────────────┴─────────────┐                   │
│       │                           │                   │
│  ┌────▼─────┐              ┌─────▼────┐              │
│  │ PostgreSQL│              │  Redis   │              │
│  │   :5432   │              │  :6379   │              │
│  └───────────┘              └──────────┘              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required

1. **Docker** (version 20.10 or later)
   ```bash
   docker --version
   ```

2. **Docker Compose** (version 2.0 or later)
   ```bash
   docker compose version
   ```

3. **AWS Account** for SES (Simple Email Service)
   - Required for sending emails
   - [Sign up for AWS](https://aws.amazon.com/)
   - [Set up SES](https://docs.aws.amazon.com/ses/latest/dg/setting-up.html)

### Optional

- **Domain name** - For production deployment
- **Reverse proxy** (Nginx, Caddy, Traefik) - For SSL/TLS
- **GitHub/Google OAuth apps** - For social login
- **Stripe account** - For payment processing

## Quick Start

### 1. Download Configuration Files

```bash
# Clone the repository (or download the files)
git clone https://github.com/useplunk/plunk.git
cd plunk

# Or download just the necessary files:
# - docker-compose.self-host.yml
# - .env.self-host.example
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.self-host.example .env

# Generate secure secrets
openssl rand -base64 32  # For DB_PASSWORD
openssl rand -base64 32  # For JWT_SECRET

# Edit .env and fill in your values
nano .env
```

**Minimum required configuration:**

```bash
# Database
DB_PASSWORD=<your-secure-password>

# Security
JWT_SECRET=<your-jwt-secret>

# AWS SES (for sending emails)
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=<your-aws-key>
AWS_SES_SECRET_ACCESS_KEY=<your-aws-secret>
SES_CONFIGURATION_SET=plunk-configuration-set

# URLs (update these for production)
API_URI=http://localhost:8080
DASHBOARD_URI=http://localhost:3000
LANDING_URI=http://localhost:4000
```

### 3. Start Plunk

```bash
# Start all services
docker compose -f docker-compose.self-host.yml up -d

# Check logs
docker compose -f docker-compose.self-host.yml logs -f

# Check status
docker compose -f docker-compose.self-host.yml ps
```

### 4. Access Plunk

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:8080
- **Landing**: http://localhost:4000 (if running with `--profile full`)

### 5. Create Your First Account

Visit http://localhost:3000 and sign up for an account. The first account created will have full access.

## Configuration

### Environment Variables Reference

See [.env.self-host.example](.env.self-host.example) for a complete list of configuration options.

#### Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASSWORD` | Yes | - | PostgreSQL database password |
| `JWT_SECRET` | Yes | - | Secret for JWT token signing |
| `API_URI` | Yes | `http://localhost:8080` | Public URL of API |
| `DASHBOARD_URI` | Yes | `http://localhost:3000` | Public URL of dashboard |

#### AWS SES (Email Sending)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_SES_REGION` | Yes | - | AWS region (e.g., us-east-1) |
| `AWS_SES_ACCESS_KEY_ID` | Yes | - | AWS IAM access key |
| `AWS_SES_SECRET_ACCESS_KEY` | Yes | - | AWS IAM secret key |
| `SES_CONFIGURATION_SET` | Yes | - | SES configuration set name |

#### OAuth (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_OAUTH_CLIENT` | No | - | GitHub OAuth client ID |
| `GITHUB_OAUTH_SECRET` | No | - | GitHub OAuth client secret |
| `GOOGLE_OAUTH_CLIENT` | No | - | Google OAuth client ID |
| `GOOGLE_OAUTH_SECRET` | No | - | Google OAuth client secret |

#### Stripe (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SK` | No | - | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | - | Stripe webhook secret |

### Setting Up AWS SES

1. **Verify Your Domain**
   - Go to [AWS SES Console](https://console.aws.amazon.com/ses/)
   - Navigate to "Verified identities"
   - Click "Create identity" and verify your domain

2. **Create IAM User**
   ```bash
   # Create a user with SES sending permissions
   # Attach policy: AmazonSESFullAccess (or create custom policy)
   ```

3. **Request Production Access**
   - By default, SES is in sandbox mode (limited to verified emails)
   - [Request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

4. **Create Configuration Set**
   - Go to "Configuration sets" in SES Console
   - Create a set named `plunk-configuration-set`
   - Set up SNS topics for bounces and complaints

## Deployment Options

### Option 1: Standard Deployment (Recommended)

Run each service in a separate container for better scalability and fault isolation.

```bash
docker compose -f docker-compose.self-host.yml up -d
```

This starts:
- API server (1 instance)
- Worker (2 instances by default)
- Web dashboard (1 instance)
- PostgreSQL
- Redis

### Option 2: All-in-One Container

Run all services in a single container for simplicity.

```bash
# Edit docker-compose.self-host.yml and uncomment the "plunk-all" service
# Comment out the individual services (api, worker, web, landing, wiki)

docker compose -f docker-compose.self-host.yml up -d plunk-all
```

### Option 3: Without Docker Compose

Run the container directly:

```bash
docker run -d \
  --name plunk \
  -e SERVICE=all \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=your-secret \
  -e AWS_SES_REGION=us-east-1 \
  -e AWS_SES_ACCESS_KEY_ID=your-key \
  -e AWS_SES_SECRET_ACCESS_KEY=your-secret \
  -e SES_CONFIGURATION_SET=plunk-configuration-set \
  -p 8080:8080 \
  -p 3000:3000 \
  ghcr.io/useplunk/plunk:latest
```

### Including Optional Services

To run landing page and documentation:

```bash
docker compose -f docker-compose.self-host.yml --profile full up -d
```

## Scaling

### Scaling Workers

Workers process background jobs (emails, campaigns, workflows). Scale based on your sending volume:

```bash
# In .env file
WORKER_REPLICAS=5

# Or via docker compose
docker compose -f docker-compose.self-host.yml up -d --scale worker=5
```

**Guidelines:**
- 1-2 workers: Up to 10,000 emails/day
- 3-5 workers: Up to 100,000 emails/day
- 5+ workers: 100,000+ emails/day

### Scaling API

```bash
docker compose -f docker-compose.self-host.yml up -d --scale api=3
```

Add a load balancer (Nginx, HAProxy) in front of multiple API instances.

### Database Performance

For high load (1M+ contacts):

1. **Use external PostgreSQL** (AWS RDS, Google Cloud SQL, etc.)
   ```bash
   # In .env
   DATABASE_URL=postgresql://user:pass@your-rds-instance.amazonaws.com:5432/plunk
   ```

2. **Increase connection pool size**
   ```bash
   # Add to DATABASE_URL
   DATABASE_URL=postgresql://...?connection_limit=20&pool_timeout=60
   ```

3. **Use read replicas** for analytics queries

## Maintenance

### Database Migrations

Migrations run automatically on API startup. To run manually:

```bash
docker compose -f docker-compose.self-host.yml exec api yarn workspace @repo/db migrate:prod
```

### Backups

#### PostgreSQL Backup

```bash
# Create backup
docker compose -f docker-compose.self-host.yml exec postgres pg_dump -U plunk plunk > backup.sql

# Restore backup
docker compose -f docker-compose.self-host.yml exec -T postgres psql -U plunk plunk < backup.sql
```

#### Automated Backups

Add to crontab:

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup-script.sh
```

Example backup script:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
docker compose -f docker-compose.self-host.yml exec -T postgres \
  pg_dump -U plunk plunk | gzip > "$BACKUP_DIR/plunk_$DATE.sql.gz"

# Keep only last 7 days
find $BACKUP_DIR -name "plunk_*.sql.gz" -mtime +7 -delete
```

### Updates

```bash
# Pull latest image
docker compose -f docker-compose.self-host.yml pull

# Restart services
docker compose -f docker-compose.self-host.yml up -d

# Check logs
docker compose -f docker-compose.self-host.yml logs -f
```

### Monitoring

#### Check Service Health

```bash
# API health check
curl http://localhost:8080/health

# Check all services
docker compose -f docker-compose.self-host.yml ps

# View logs
docker compose -f docker-compose.self-host.yml logs -f api
docker compose -f docker-compose.self-host.yml logs -f worker
```

#### Monitor Queue Depth

Watch Redis for queue backlog:

```bash
docker compose -f docker-compose.self-host.yml exec redis redis-cli

# In Redis CLI:
127.0.0.1:6379> KEYS bull:*:waiting
127.0.0.1:6379> LLEN bull:email:waiting
```

## Troubleshooting

### Emails Not Sending

1. **Check worker logs**
   ```bash
   docker compose -f docker-compose.self-host.yml logs worker
   ```

2. **Verify AWS SES credentials**
   ```bash
   # Test AWS SES
   aws ses verify-email-identity --email-address test@yourdomain.com
   ```

3. **Check SES sending limits**
   - Sandbox mode: Only verified emails
   - Production: Check daily sending quota

4. **Verify Redis connection**
   ```bash
   docker compose -f docker-compose.self-host.yml exec redis redis-cli ping
   ```

### Database Connection Issues

1. **Check database logs**
   ```bash
   docker compose -f docker-compose.self-host.yml logs postgres
   ```

2. **Verify connection string**
   ```bash
   docker compose -f docker-compose.self-host.yml exec api node -e "console.log(process.env.DATABASE_URL)"
   ```

3. **Test connection**
   ```bash
   docker compose -f docker-compose.self-host.yml exec postgres psql -U plunk -d plunk -c "SELECT 1"
   ```

### High Memory Usage

1. **Check container stats**
   ```bash
   docker stats
   ```

2. **Reduce worker replicas**
   ```bash
   WORKER_REPLICAS=1 docker compose -f docker-compose.self-host.yml up -d
   ```

3. **Limit container memory**
   ```yaml
   # In docker-compose.self-host.yml
   services:
     api:
       mem_limit: 512m
   ```

### Port Already in Use

```bash
# Find what's using the port
lsof -i :8080

# Change port in docker-compose.self-host.yml
ports:
  - "8081:8080"  # Host:Container
```

## Security Best Practices

### 1. Use Strong Secrets

```bash
# Generate secure random strings
openssl rand -base64 32
```

### 2. Enable SSL/TLS

Use a reverse proxy (Caddy recommended for auto-SSL):

```yaml
# docker-compose.caddy.yml
services:
  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
```

```caddyfile
# Caddyfile
app.yourdomain.com {
    reverse_proxy plunk-web:3000
}

api.yourdomain.com {
    reverse_proxy plunk-api:8080
}
```

### 3. Firewall Configuration

```bash
# Only expose necessary ports
# Use internal Docker network for service communication
```

### 4. Regular Updates

```bash
# Set up automatic security updates
docker compose -f docker-compose.self-host.yml pull
docker compose -f docker-compose.self-host.yml up -d
```

### 5. Database Security

- Use strong passwords
- Enable SSL for database connections
- Regular backups
- Restrict network access

### 6. Environment Variables

- Never commit `.env` to git
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets regularly

## Support

- **Documentation**: https://docs.useplunk.com
- **GitHub Issues**: https://github.com/useplunk/plunk/issues
- **Community**: [Join our Discord](https://discord.gg/plunk)

## License

Plunk is open source software. See [LICENSE](LICENSE) for details.
