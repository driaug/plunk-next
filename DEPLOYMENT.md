# Deployment Guide

This guide covers how to deploy Plunk in various environments.

## Architecture Overview

Plunk consists of multiple components that should be deployed separately:

1. **API Server** - HTTP API for handling requests
2. **Worker** - Background job processor (emails, campaigns, workflows)
3. **Web App** - Next.js frontend application
4. **Landing Page** - Marketing website
5. **Infrastructure** - PostgreSQL, Redis, and other services

## Development

### Local Development

To run the full stack locally, you need to start multiple processes:

```bash
# Terminal 1: Start infrastructure services (PostgreSQL, Redis, etc.)
yarn services:up

# Terminal 2: Start API server
yarn workspace api dev

# Terminal 3: Start worker for background jobs (REQUIRED for emails/workflows)
yarn workspace api dev:worker

# Terminal 4 (optional): Start web app
yarn workspace web dev

# Terminal 5 (optional): Start landing page
yarn workspace landing dev
```

### Why Separate Processes?

- **Scalability**: Workers can be scaled independently from the API
- **Fault Isolation**: If workers crash, API continues serving requests
- **Resource Management**: Different resource requirements and limits
- **Deployment Flexibility**: Deploy to different containers/instances

## Production Deployment

### Docker Deployment (Recommended)

Create separate containers for each component:

```dockerfile
# Dockerfile.api
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN yarn install --frozen-lockfile

# Build
COPY apps/api ./apps/api
RUN yarn workspace api build

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./dist
COPY --from=base /app/packages ./packages

CMD ["node", "dist/app.js"]
```

```dockerfile
# Dockerfile.worker
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
RUN yarn install --frozen-lockfile

# Build
COPY apps/api ./apps/api
RUN yarn workspace api build

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/api/dist ./dist
COPY --from=base /app/packages ./packages

CMD ["node", "dist/jobs/worker.js"]
```

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: plunk
      POSTGRES_USER: plunk
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      # ... other env vars
    depends_on:
      - postgres
      - redis
    ports:
      - "4000:4000"
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile.worker
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: redis://redis:6379
      # ... other env vars
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    # Scale workers independently
    deploy:
      replicas: 2

volumes:
  postgres_data:
  redis_data:
```

### Kubernetes Deployment

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plunk-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: plunk-api
  template:
    metadata:
      labels:
        app: plunk-api
    spec:
      containers:
      - name: api
        image: plunk-api:latest
        ports:
        - containerPort: 4000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: plunk-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"

---
# k8s/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plunk-worker
spec:
  replicas: 2  # Scale based on queue depth
  selector:
    matchLabels:
      app: plunk-worker
  template:
    metadata:
      labels:
        app: plunk-worker
    spec:
      containers:
      - name: worker
        image: plunk-worker:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: plunk-secrets
              key: database-url
        resources:
          requests:
            memory: "1Gi"
            cpu: "1000m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

### Platform-as-a-Service (Vercel, Railway, Render, etc.)

Most PaaS platforms require configuration for multiple services:

#### Render.com Example

Create a `render.yaml`:

```yaml
services:
  - type: web
    name: plunk-api
    env: node
    region: oregon
    plan: starter
    buildCommand: yarn install && yarn workspace api build
    startCommand: yarn workspace api start
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false

  - type: worker
    name: plunk-worker
    env: node
    region: oregon
    plan: starter
    buildCommand: yarn install && yarn workspace api build
    startCommand: yarn workspace api start:worker
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false

  - type: web
    name: plunk-web
    env: node
    region: oregon
    plan: starter
    buildCommand: yarn install && yarn workspace web build
    startCommand: yarn workspace web start
    envVars:
      - key: NEXT_PUBLIC_API_URI
        sync: false

databases:
  - name: plunk-postgres
    plan: starter
    region: oregon

  - name: plunk-redis
    plan: starter
    region: oregon
```

## Monitoring & Scaling

### Worker Scaling

Monitor your BullMQ queues and scale workers based on:

- **Queue depth**: If emails queue is growing, add more workers
- **Processing time**: Monitor job completion times
- **Error rates**: Track failed jobs

### Health Checks

API health check:
```bash
curl http://localhost:4000/health
```

Worker health monitoring (check queue stats):
```bash
# Add an endpoint to your API to expose queue stats
curl http://localhost:4000/api/queue/stats
```

## Environment Variables

Required for production:

```bash
# Database
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Authentication
JWT_SECRET=...

# Email (AWS SES)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Stripe (if using payments)
STRIPE_SK=...
STRIPE_WEBHOOK_SECRET=...

# Application URLs
API_URI=https://api.yourapp.com
APP_URI=https://app.yourapp.com
LANDING_URI=https://www.yourapp.com
```

## Database Migrations

Run migrations before deploying new versions:

```bash
# Production migration
yarn workspace @repo/db migrate:prod
```

## Troubleshooting

### Emails not sending?

1. Check if worker is running: `docker ps` or `kubectl get pods`
2. Check worker logs for errors
3. Verify Redis connection
4. Check AWS SES credentials and limits

### High queue backlog?

1. Scale up workers: Increase replica count
2. Check for failing jobs blocking the queue
3. Monitor AWS SES sending limits

### Database connection issues?

1. Check connection pool settings in Prisma
2. Verify DATABASE_URL is correct
3. Check if database allows connections from worker IPs
