# Docker Development Guide

Quick reference for building and testing the Plunk Docker image locally.

## Building the Image

### Build for local testing

```bash
# Build the image
docker build -t plunk:local .

# This will take 10-15 minutes on first build
# Subsequent builds will be faster due to layer caching
```

### Build for specific platform

```bash
# For Apple Silicon (M1/M2/M3)
docker build --platform linux/arm64 -t plunk:local .

# For Intel/AMD (x86_64)
docker build --platform linux/amd64 -t plunk:local .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t plunk:local .
```

## Testing Services

### Test individual services

```bash
# Test API
docker run --rm \
  -e SERVICE=api \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=test \
  -p 8080:8080 \
  plunk:local

# Test Worker
docker run --rm \
  -e SERVICE=worker \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  plunk:local

# Test Web
docker run --rm \
  -e SERVICE=web \
  -p 3000:3000 \
  plunk:local

# Test All Services (PM2)
docker run --rm \
  -e SERVICE=all \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=test \
  -p 8080:8080 \
  -p 3000:3000 \
  -p 4000:4000 \
  -p 1000:1000 \
  plunk:local
```

### Test with Docker Compose

```bash
# Use local image instead of pulling from registry
# Edit docker-compose.self-host.yml and change:
#   image: ghcr.io/useplunk/plunk:latest
# to:
#   image: plunk:local

# Start all services
docker compose -f docker-compose.self-host.yml up -d

# View logs
docker compose -f docker-compose.self-host.yml logs -f

# Stop services
docker compose -f docker-compose.self-host.yml down
```

## Inspecting the Image

### Check image size

```bash
docker images plunk:local
```

### Inspect image contents

```bash
# List files in image
docker run --rm plunk:local ls -la /app

# Check built applications
docker run --rm plunk:local ls -la /app/apps/api/dist
docker run --rm plunk:local ls -la /app/apps/web/.next
docker run --rm plunk:local ls -la /app/apps/landing/.next
docker run --rm plunk:local ls -la /app/apps/wiki/.next

# Check Node.js version
docker run --rm plunk:local node --version

# Check entrypoint script
docker run --rm plunk:local cat /usr/local/bin/docker-entrypoint.sh
```

### Interactive shell

```bash
docker run --rm -it plunk:local sh
```

## Debugging Build Issues

### Build with verbose output

```bash
docker build --progress=plain --no-cache -t plunk:local .
```

### Build specific stage

```bash
# Build only the dependencies stage
docker build --target deps -t plunk:deps .

# Build only the builder stage
docker build --target builder -t plunk:builder .
```

### Check build logs

```bash
# Build and save logs
docker build -t plunk:local . 2>&1 | tee build.log
```

## Optimizing Build Time

### Use BuildKit cache

```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Build with cache
docker build -t plunk:local .
```

### Use buildx with cache

```bash
# Build with GitHub Actions cache format (local development)
docker buildx build \
  --cache-from type=local,src=/tmp/.buildx-cache \
  --cache-to type=local,dest=/tmp/.buildx-cache \
  -t plunk:local \
  --load \
  .
```

## Common Issues

### Build fails during dependency installation

**Solution**: Clear Docker cache and rebuild

```bash
docker builder prune -f
docker build --no-cache -t plunk:local .
```

### Build fails during TypeScript compilation

**Solution**: Check if source code has TypeScript errors

```bash
# Build locally first to see errors
yarn build
```

### Image is too large

**Solution**: Check image layers

```bash
# Analyze image layers
docker history plunk:local

# Use dive to inspect image
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive:latest plunk:local
```

### Prisma client not generated

**Solution**: Ensure Prisma generate runs during build

```bash
# Check if Prisma client exists in image
docker run --rm plunk:local ls -la /app/node_modules/.prisma/client
```

## CI/CD Integration

### GitHub Actions

The workflow is automatically configured in `.github/workflows/docker-publish.yml`

**Manual trigger:**

```bash
# Push to main branch (triggers automatic build)
git push origin main

# Create a release (triggers versioned build)
git tag v1.0.0
git push origin v1.0.0

# Manual workflow dispatch from GitHub UI
# Go to Actions -> Build and Publish Docker Image -> Run workflow
```

### Pull published image

```bash
# Pull latest
docker pull ghcr.io/useplunk/plunk:latest

# Pull specific version
docker pull ghcr.io/useplunk/plunk:v1.0.0

# Pull for specific platform
docker pull --platform linux/arm64 ghcr.io/useplunk/plunk:latest
```

## Performance Tips

1. **Use layer caching**: Don't modify files unnecessarily between builds
2. **Multi-stage builds**: Already implemented to reduce final image size
3. **BuildKit**: Enable for better caching and parallelization
4. **prune regularly**: Clean up unused images and build cache

```bash
# Clean up
docker system prune -af
docker builder prune -af
```

## Image Tags

When published to GitHub Container Registry:

- `latest` - Latest build from main branch
- `vX.Y.Z` - Semantic version tags (e.g., v1.2.3)
- `main-<sha>` - Commit-specific builds from main branch
- `pr-<number>` - Pull request builds (for testing)

## Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Docker Build Cache](https://docs.docker.com/build/cache/)
- [Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose](https://docs.docker.com/compose/)
