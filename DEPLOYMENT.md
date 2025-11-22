# Plunk Self-Hosting Guide

This guide covers everything you need to self-host Plunk on your own infrastructure.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [HTTPS Setup](#https-setup)
- [Monitoring](#monitoring)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/useplunk/plunk.git
cd plunk

# 2. Copy environment file
cp .env.self-host.example .env

# 3. Configure your domains and secrets in .env
# Set: API_DOMAIN, DASHBOARD_DOMAIN, JWT_SECRET, DB_PASSWORD, AWS SES credentials

# 4. Start all services
docker compose up -d

# 5. Access your instance
# API: http://api.localhost
# Dashboard: http://app.localhost
# Landing: http://www.localhost
```

---

## Architecture

Plunk uses a simple, single-container architecture with nginx reverse proxy:

```
┌─────────────────────────────────────────────────────┐
│  Docker Container: plunk                            │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  Nginx Reverse Proxy (Port 80)              │  │
│  │  Routes by subdomain:                       │  │
│  │  - api.example.com → :8080                  │  │
│  │  - app.example.com → :3000                  │  │
│  │  - www.example.com → :4000                  │  │
│  │  - docs.example.com → :1000                 │  │
│  └────┬──────────┬──────────┬──────────┬───────┘  │
│       │          │          │          │           │
│  ┌────▼────┐ ┌──▼────┐ ┌──▼─────┐ ┌──▼─────┐    │
│  │   API   │ │  Web  │ │Landing │ │  Wiki  │    │
│  │  :8080  │ │ :3000 │ │ :4000  │ │ :1000  │    │
│  └─────────┘ └───────┘ └────────┘ └────────┘    │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  Worker Process (BullMQ)                    │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  All managed by PM2                                │
└─────────────────────────────────────────────────────┘

  External containers:
  - PostgreSQL (database)
  - Redis (cache & queues)
```

### Components

**Plunk Container:**
- **Nginx**: Reverse proxy routing traffic by subdomain
- **API Server**: HTTP endpoints, cron jobs, business logic
- **Worker**: Background job processor for emails, campaigns, workflows
- **Web**: Next.js dashboard application
- **Landing**: Next.js marketing website
- **Wiki**: Next.js documentation site
- **PM2**: Process manager keeping all services running

**Infrastructure:**
- **PostgreSQL**: Main database (1M+ contacts/month scale)
- **Redis**: Cache and BullMQ job queues

---

## Requirements

### System Requirements

**Minimum (light usage):**
- 2 CPU cores
- 4 GB RAM
- 20 GB storage
- Docker 20.10+
- Docker Compose v2.0+

**Recommended (production):**
- 4+ CPU cores
- 8 GB RAM
- 50 GB storage (grows with database)

**High volume (100k+ emails/day):**
- 8+ CPU cores
- 16 GB RAM
- 100 GB+ storage

### Required Services

- **AWS SES**: For sending emails (required)
- **Domain names**: For subdomain routing (can use localhost for testing)

### Optional Services

- **AWS S3**: File uploads (if needed)
- **Stripe**: Payment processing (if monetizing)
- **GitHub/Google OAuth**: Social login

---

## Installation

### 1. Prepare Environment

```bash
# Copy environment template
cp .env.self-host.example .env
```

### 2. Configure Domains

Edit `.env` and set your domains:

```bash
# Production example
API_DOMAIN=api.example.com
DASHBOARD_DOMAIN=app.example.com
LANDING_DOMAIN=www.example.com
WIKI_DOMAIN=docs.example.com
NGINX_PORT=80
```

Or for local testing:

```bash
# Local development
API_DOMAIN=api.localhost
DASHBOARD_DOMAIN=app.localhost
LANDING_DOMAIN=www.localhost
WIKI_DOMAIN=docs.localhost
NGINX_PORT=80
```

**Note**: You can use:
- Different subdomains: `api.example.com`, `app.example.com`
- Completely different domains: `api.myapp.com`, `dashboard.different.com`
- All route through the same nginx port (default: 80)

### 3. Set Required Secrets

```bash
# Generate strong secrets
openssl rand -base64 32

# Set in .env
DB_PASSWORD=your_strong_db_password
JWT_SECRET=your_strong_jwt_secret
```

### 4. Configure AWS SES

You need AWS SES to send emails. Set in `.env`:

```bash
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=your_access_key
AWS_SES_SECRET_ACCESS_KEY=your_secret_key
SES_CONFIGURATION_SET=plunk-configuration-set
```

See [AWS SES Setup Guide](https://docs.aws.amazon.com/ses/latest/dg/setting-up.html)

### 5. Start Services

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

### 6. Verify Deployment

```bash
# Check health
curl http://api.localhost/health

# Or if using custom domain
curl http://api.example.com/health

# Should return: {"status":"ok"}
```

### 7. Access Your Instance

Based on your domain configuration:
- API: `http://api.example.com`
- Dashboard: `http://app.example.com`
- Landing: `http://www.example.com`
- Docs: `http://docs.example.com`

---

## Configuration

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_PASSWORD` | PostgreSQL password | Generate with `openssl rand -base64 32` |
| `JWT_SECRET` | Authentication secret | Generate with `openssl rand -base64 32` |
| `API_DOMAIN` | API server domain | `api.example.com` |
| `DASHBOARD_DOMAIN` | Dashboard domain | `app.example.com` |
| `LANDING_DOMAIN` | Landing page domain | `www.example.com` |
| `WIKI_DOMAIN` | Documentation domain | `docs.example.com` |
| `AWS_SES_REGION` | AWS SES region | `us-east-1` |
| `AWS_SES_ACCESS_KEY_ID` | AWS SES access key | From AWS IAM |
| `AWS_SES_SECRET_ACCESS_KEY` | AWS SES secret | From AWS IAM |
| `SES_CONFIGURATION_SET` | SES config set | `plunk-configuration-set` |

#### Optional

| Variable | Purpose | Default |
|----------|---------|---------|
| `NGINX_PORT` | Nginx listen port | `80` |
| `GITHUB_OAUTH_CLIENT` | GitHub OAuth | - |
| `GITHUB_OAUTH_SECRET` | GitHub OAuth | - |
| `GOOGLE_OAUTH_CLIENT` | Google OAuth | - |
| `GOOGLE_OAUTH_SECRET` | Google OAuth | - |
| `STRIPE_SK` | Stripe payments | - |
| `AWS_S3_BUCKET` | File uploads | - |
| `PLUNK_API_KEY` | Internal notifications | - |

### DNS Configuration

For production, configure DNS records for your domains:

**Option 1: Individual A records**
```
api.example.com     A    YOUR_SERVER_IP
app.example.com     A    YOUR_SERVER_IP
www.example.com     A    YOUR_SERVER_IP
docs.example.com    A    YOUR_SERVER_IP
```

**Option 2: Wildcard (simpler)**
```
*.example.com       A    YOUR_SERVER_IP
```

**Option 3: Local testing (/etc/hosts)**
```
127.0.0.1  api.localhost
127.0.0.1  app.localhost
127.0.0.1  www.localhost
127.0.0.1  docs.localhost
```

---

## HTTPS Setup

For production, use a reverse proxy with automatic HTTPS in front of Plunk:

### Option 1: Caddy (Recommended)

Simplest option with automatic Let's Encrypt certificates:

**Caddyfile:**
```caddyfile
api.example.com {
    reverse_proxy localhost:80
}

app.example.com {
    reverse_proxy localhost:80
}

www.example.com {
    reverse_proxy localhost:80
}

docs.example.com {
    reverse_proxy localhost:80
}
```

Start Caddy:
```bash
caddy run
```

### Option 2: Traefik

Great for Docker environments:

**docker-compose.override.yml:**
```yaml
version: '3.8'

services:
  plunk:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.example.com`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.rule=Host(`app.example.com`)"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      # Add more routers for landing and wiki...
```

### Option 3: Certbot + Nginx

Manual certificate management:

```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificates
certbot --nginx -d api.example.com -d app.example.com -d www.example.com -d docs.example.com

# Auto-renewal
systemctl enable certbot.timer
```

---

## Monitoring

### Health Checks

All services include health checks:

```bash
# Overall health
docker compose ps

# API health endpoint
curl http://api.example.com/health

# Check all services in container
docker exec plunk pm2 list
```

### Logs

```bash
# Follow all logs
docker compose logs -f

# Specific service logs
docker compose logs -f plunk

# Inside container - view PM2 logs
docker exec plunk pm2 logs

# View nginx logs
docker exec plunk cat /var/log/nginx/access.log
docker exec plunk cat /var/log/nginx/error.log
```

### Resource Usage

```bash
# Container stats
docker stats plunk

# Disk usage
docker system df
```

### Database Monitoring

```bash
# Connect to database
docker exec -it plunk-postgres psql -U plunk

# Check active queries
SELECT * FROM pg_stat_activity WHERE state = 'active';

# Check database size
SELECT pg_database_size('plunk');

# Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### Queue Monitoring

```bash
# Connect to Redis
docker exec -it plunk-redis redis-cli

# Check queue depth
LLEN bull:email:wait
LLEN bull:campaign:wait
LLEN bull:workflow:wait
```

---

## Backup and Recovery

### Database Backup

```bash
# Backup database
docker exec plunk-postgres pg_dump -U plunk plunk > backup-$(date +%Y%m%d).sql

# Restore database
docker exec -i plunk-postgres psql -U plunk plunk < backup-20250322.sql
```

### Volume Backup

```bash
# Stop services
docker compose down

# Backup volumes
docker run --rm \
  -v plunk_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data

docker run --rm \
  -v plunk_redis_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/redis-backup.tar.gz /data

# Start services
docker compose up -d
```

### Automated Backups

Create a backup script:

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"

mkdir -p $BACKUP_DIR

# Database backup
docker exec plunk-postgres pg_dump -U plunk plunk | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "db-*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/db-$DATE.sql.gz"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/backup.sh
```

---

## Troubleshooting

### Services Won't Start

**Check logs:**
```bash
docker compose logs plunk
```

**Common issues:**
- Database not ready: Wait for postgres health check
- Missing environment variables: Check `.env` file
- Port conflicts: Change `NGINX_PORT` in `.env`

### Database Connection Errors

**Verify postgres is running:**
```bash
docker compose ps postgres
```

**Check connection string:**
```bash
# Should be:
DATABASE_URL=postgresql://plunk:YOUR_PASSWORD@postgres:5432/plunk
```

**Test connection:**
```bash
docker exec plunk-postgres pg_isready -U plunk
```

### Nginx Configuration Issues

**View generated config:**
```bash
docker exec plunk cat /etc/nginx/conf.d/plunk.conf
```

**Test nginx syntax:**
```bash
docker exec plunk nginx -t
```

**Reload nginx:**
```bash
docker exec plunk nginx -s reload
```

**Check environment variables:**
```bash
docker exec plunk env | grep DOMAIN
```

### Service Not Responding (502 Bad Gateway)

**Check which service is down:**
```bash
docker exec plunk pm2 list
```

**Restart specific service:**
```bash
docker exec plunk pm2 restart api
docker exec plunk pm2 restart web
docker exec plunk pm2 restart worker
```

**View service logs:**
```bash
docker exec plunk pm2 logs api
```

### Worker Not Processing Jobs

**Check Redis:**
```bash
docker compose ps redis
```

**Check queue depth:**
```bash
docker exec plunk-redis redis-cli LLEN bull:email:wait
```

**Restart worker:**
```bash
docker exec plunk pm2 restart worker
```

### High Memory Usage

**Check memory usage:**
```bash
docker stats plunk
```

**Optimize PostgreSQL:**
```sql
-- Run VACUUM to reclaim space
VACUUM ANALYZE;

-- Check bloat
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

**Check for memory leaks:**
```bash
docker exec plunk pm2 monit
```

### Slow Performance

**Check database queries:**
```sql
-- Find slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
```

**Add missing indexes:**
```sql
-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND tablename NOT LIKE 'pg_%'
ORDER BY abs(correlation) DESC;
```

**Optimize Redis:**
```bash
# Check Redis memory
docker exec plunk-redis redis-cli INFO memory

# Clear old data if needed
docker exec plunk-redis redis-cli FLUSHDB
```

### DNS Not Resolving

**For production:**
- Verify DNS records are configured correctly
- Wait for DNS propagation (can take up to 48 hours)
- Test with `dig api.example.com` or `nslookup api.example.com`

**For local testing:**
- Add entries to `/etc/hosts` (see DNS Configuration above)
- Or use `*.localhost` which resolves automatically

### Port Already in Use

**Find what's using the port:**
```bash
lsof -i :80
```

**Change nginx port:**
```bash
# In .env
NGINX_PORT=8080

# Restart
docker compose up -d
```

---

## Performance Optimization

### Database

At scale (1M+ contacts/month):

```sql
-- Add indexes for common queries
CREATE INDEX idx_contacts_email ON "Contact"(email);
CREATE INDEX idx_contacts_project ON "Contact"("projectId");
CREATE INDEX idx_events_contact ON "Event"("contactId");

-- Regular maintenance
VACUUM ANALYZE;

-- Update statistics
ANALYZE;
```

### Redis

Configure persistence and memory limits:

```yaml
# In docker-compose.yml
redis:
  command: redis-server --appendonly yes --maxmemory 2gb --maxmemory-policy allkeys-lru
```

### Application

Monitor PM2 processes:

```bash
# Inside container
pm2 monit

# Resource usage
pm2 list
```

---

## Updating

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d

# Database migrations run automatically on startup
```

---

## Support

- **Documentation**: https://docs.useplunk.com
- **GitHub Issues**: https://github.com/useplunk/plunk/issues
- **Discord**: https://discord.gg/plunk

---

## Next Steps

After successful deployment:

1. **Set up HTTPS** with Caddy or Certbot
2. **Configure backups** with automated cron jobs
3. **Monitor performance** with your preferred tools
4. **Set up alerts** for downtime or errors
5. **Review security** settings and firewall rules

Happy self-hosting! 🚀
