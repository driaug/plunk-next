# Nginx Configuration for Plunk

This directory contains the nginx configuration files for Plunk's reverse proxy.

## Quick Start

### 1. Configure Your Domains

```bash
# .env
API_DOMAIN=api.example.com
DASHBOARD_DOMAIN=app.example.com
LANDING_DOMAIN=www.example.com
WIKI_DOMAIN=docs.example.com
NGINX_PORT=80
```

### 2. Set Required Environment Variables

```bash
# Copy example configuration
cp .env.self-host.example .env

# Edit .env and set:
# - Domain configuration (API_DOMAIN, DASHBOARD_DOMAIN, etc.)
# - DB_PASSWORD
# - JWT_SECRET
# - AWS SES credentials
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Access Your Instance

- API: `http://api.example.com`
- Dashboard: `http://app.example.com`
- Landing: `http://www.example.com`
- Docs: `http://docs.example.com`

## Files

- `nginx.conf.template` - Nginx configuration template
- `setup-nginx.sh` - Configures nginx at container startup
- `README.md` - This file

## How It Works

1. **Container startup**: `docker-entrypoint-nginx.sh` runs
2. **Nginx setup**: `setup-nginx.sh` generates configuration from template
3. **Environment variables**: Domain names substituted into nginx config
4. **PM2 start**: All services (nginx + api + worker + web + landing + wiki) start via PM2
5. **Nginx routing**: Routes external requests to internal services based on subdomain

## Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `API_DOMAIN` | API server domain | `api.localhost` | `api.example.com` |
| `DASHBOARD_DOMAIN` | Dashboard domain | `app.localhost` | `app.example.com` |
| `LANDING_DOMAIN` | Landing page domain | `www.localhost` | `www.example.com` |
| `WIKI_DOMAIN` | Documentation domain | `docs.localhost` | `docs.example.com` |
| `NGINX_PORT` | Nginx listen port | `80` | `80` or `8080` |

## Subdomain-based Routing

Nginx creates separate `server` blocks for each subdomain:

```nginx
server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        # ... proxy headers
    }
}

server {
    listen 80;
    server_name app.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        # ... proxy headers
    }
}
```

**Note**: All domains route through the same nginx port. You can use:
- Different subdomains: `api.example.com`, `app.example.com`
- Different domains entirely: `api.myapp.com`, `dashboard.anotherone.com`
- Mix of both

## Debugging

### View Generated Config

```bash
docker exec plunk cat /etc/nginx/conf.d/plunk.conf
```

### Test Nginx Configuration

```bash
docker exec plunk nginx -t
```

### Reload Nginx

```bash
docker exec plunk nginx -s reload
```

### Check Running Services

```bash
docker exec plunk pm2 list
```

### View Service Logs

```bash
# All services
docker compose logs -f plunk

# Just nginx
docker exec plunk pm2 logs nginx

# Just API
docker exec plunk pm2 logs api
```

## Troubleshooting

### 502 Bad Gateway

**Cause**: Backend service not running

**Solution**:
```bash
# Check which service is down
docker exec plunk pm2 list

# Restart specific service
docker exec plunk pm2 restart api
```

### Invalid domain configuration

**Cause**: Environment variables not set correctly

**Solution**:
```bash
# Check environment
docker exec plunk env | grep DOMAIN

# Fix .env and recreate container
docker compose up -d --force-recreate
```

### Nginx not starting

**Cause**: Configuration syntax error

**Solution**:
```bash
# Test configuration
docker exec plunk nginx -t

# Check logs
docker logs plunk
```

### DNS not resolving subdomains

**Cause**: DNS records not configured

**Solution**:
1. Add A records for each subdomain pointing to your server IP:
   ```
   api.example.com    A    YOUR_SERVER_IP
   app.example.com    A    YOUR_SERVER_IP
   www.example.com    A    YOUR_SERVER_IP
   docs.example.com   A    YOUR_SERVER_IP
   ```

2. Or use wildcard DNS:
   ```
   *.example.com      A    YOUR_SERVER_IP
   ```

3. For local testing, edit `/etc/hosts`:
   ```
   127.0.0.1  api.localhost
   127.0.0.1  app.localhost
   127.0.0.1  www.localhost
   127.0.0.1  docs.localhost
   ```

## Advanced Configuration

### Custom Nginx Settings

To add custom nginx settings (e.g., rate limiting, caching), modify the template:

1. Edit `nginx.conf.template`
2. Add your custom configuration
3. Rebuild the nginx image:
   ```bash
   docker build -f Dockerfile.nginx -t ghcr.io/useplunk/plunk:nginx .
   ```

### HTTPS with Let's Encrypt

For production, use a reverse proxy in front of the nginx container:

**Option 1: Caddy** (Automatic HTTPS - Recommended)
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
```

**Option 2: Traefik** (Automatic HTTPS)
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.plunk-api.rule=Host(`api.example.com`)"
  - "traefik.http.routers.plunk-api.tls.certresolver=letsencrypt"
  # Add similar labels for other domains
```

**Option 3: Certbot + External Nginx**
```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificates
certbot --nginx -d api.example.com -d app.example.com -d www.example.com
```

## Performance Tuning

### Worker Processes

Nginx auto-detects CPU cores. For heavy traffic, monitor with:

```bash
docker stats plunk
```

### Connection Limits

Modify `nginx.conf` section in `setup-nginx.sh`:

```nginx
events {
    worker_connections 2048;  # Increase from 1024
}
```

### Caching Static Assets

Add caching in `nginx.conf.template`:

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Architecture Overview

Plunk runs all application services in a single container for simplicity:

| Component | Purpose | Resource Usage |
|-----------|---------|----------------|
| Container count | 3 total (plunk + postgres + redis) | ~2-4GB RAM |
| Nginx | Routes traffic by subdomain | Minimal |
| API + Worker | Handles requests & background jobs | ~500MB-1GB |
| Web/Landing/Wiki | Next.js applications | ~500MB-1GB |
| PostgreSQL | Database | ~500MB-1GB (varies with data) |
| Redis | Cache & queues | ~100-200MB |

**Note**: All services run in one container for ease of deployment. For very high-volume scenarios (1M+ contacts), consider optimizing database queries and monitoring resource usage.

## Support

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for comprehensive deployment guide.
