# Caching Strategy

This document explains the comprehensive caching strategy used in this project to speed up builds and workflows.

## Overview

Our caching strategy operates at multiple levels:

1. **Docker Layer Caching** - Reuses unchanged Docker image layers
2. **Yarn Dependency Caching** - Caches downloaded npm packages
3. **Turbo Remote Caching** - Caches build outputs across CI runs
4. **GitHub Actions Caching** - Persists cache between workflow runs

## Caching Layers

### 1. Docker Layer Caching

**Location**: `.github/workflows/docker-publish.yml`

**What it caches**: Complete Docker image layers from previous builds

```yaml
cache-from: |
  type=gha,scope=build-linux-amd64
  type=gha,scope=yarn-linux-amd64
cache-to: |
  type=gha,mode=max,scope=build-linux-amd64
  type=gha,mode=max,scope=yarn-linux-amd64
```

**Benefits**:
- Skips rebuilding unchanged layers
- Separate cache scopes per platform (AMD64/ARM64)
- Dramatically reduces Docker build times (5-10x faster)

**Cache invalidation**: Automatic when Dockerfile or source code changes

---

### 2. Yarn Dependency Caching

**Location**: Multiple places

#### A. In Docker Builds (`Dockerfile`)

Uses BuildKit cache mounts to persist Yarn's download cache:

```dockerfile
RUN --mount=type=cache,target=/root/.yarn/berry/cache,sharing=locked \
    --mount=type=cache,target=/root/.cache/yarn,sharing=locked \
    yarn install --immutable
```

**Benefits**:
- Packages downloaded once, reused across builds
- Works across different Docker builds
- Reduces bandwidth and installation time

#### B. In GitHub Actions (`.github/workflows/release.yml`)

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'yarn'
```

**Benefits**:
- Caches `node_modules` between workflow runs
- Automatic cache key based on `yarn.lock`
- Managed by GitHub Actions

---

### 3. Turbo Remote Caching

**Location**: `turbo.json`

**Configuration**:
```json
{
  "remoteCache": {
    "signature": false
  }
}
```

**What it caches**: Build outputs (compiled TypeScript, Next.js builds, etc.)

**How it works**:
- Turbo hashes input files (source code, dependencies)
- If hash matches previous build → restores cached output
- If hash differs → rebuilds and caches result

**Benefits**:
- Skips rebuilding packages that haven't changed
- Works across different machines/CI runs
- Dramatically speeds up monorepo builds

**Cache mount in Docker** (`Dockerfile`):
```dockerfile
RUN --mount=type=cache,target=/app/.turbo,sharing=locked \
    yarn build
```

**Cache location**:
- Local: `.turbo/cache/`
- CI: GitHub Actions cache

---

### 4. Turbo Cache in GitHub Actions

**Location**: `.github/workflows/docker-publish.yml`

```yaml
- name: Cache Turbo
  uses: actions/cache@v4
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-turbo-
```

**Benefits**:
- Persists Turbo's build cache between CI runs
- Speeds up subsequent builds of same commit
- Falls back to previous caches if exact match not found

---

## Cache Performance Impact

### Without Caching
```
Fresh Docker build: ~15-20 minutes
- Install dependencies: ~5 minutes
- Generate Prisma client: ~1 minute
- Build all packages: ~8-12 minutes
- Create production deps: ~3 minutes
```

### With Full Caching (Warm Cache)
```
Cached Docker build: ~2-5 minutes
- Install dependencies: ~30 seconds (cache hit)
- Generate Prisma client: ~1 minute (required)
- Build all packages: ~30 seconds - 2 minutes (Turbo cache hits)
- Create production deps: ~20 seconds (cache hit)
```

**Speed improvement**: ~75-85% faster

---

## Cache Invalidation

Caches are automatically invalidated when:

| Cache Type | Invalidated When |
|-----------|------------------|
| Docker layers | Dockerfile or source files change |
| Yarn dependencies | `yarn.lock` changes |
| Turbo builds | Source code or dependencies change |
| GitHub Actions | Manual cache clear or 7-day expiry |

---

## Best Practices

### ✅ DO
- Commit `yarn.lock` to ensure consistent dependency versions
- Use `yarn install --immutable` in CI to prevent lock file changes
- Let Turbo handle build orchestration (don't bypass it)
- Keep Dockerfile commands in optimal order (least to most frequently changed)

### ❌ DON'T
- Don't add `.turbo` to `.dockerignore` (prevents cache mounting)
- Don't manually delete GitHub Actions cache (it auto-expires)
- Don't use `yarn install` without `--immutable` in CI
- Don't bypass Docker layer caching with `--no-cache` unless necessary

---

## Monitoring Cache Performance

### Check Docker Cache Hit Rate

In GitHub Actions workflow logs, look for:
```
#8 [deps 5/6] RUN yarn install --immutable
#8 CACHED
```

`CACHED` means layer was reused.

### Check Turbo Cache Hits

In build logs, look for:
```
>>> FULL TURBO
```

This means all packages were restored from cache.

Or look for specific packages:
```
@repo/shared:build: cache hit, replaying logs [12.3s]
```

### GitHub Actions Cache Stats

View cache usage:
1. Go to repository → Actions
2. Click "Caches" in left sidebar
3. View cache sizes and hit rates

---

## Troubleshooting

### Cache not being used?

**Check 1**: Verify cache keys match
```bash
# In workflow logs, check cache keys
Cache hit: true
```

**Check 2**: Ensure BuildKit is enabled
```yaml
# In workflow
- uses: docker/setup-buildx-action@v3
```

**Check 3**: Verify cache mounts in Dockerfile
```dockerfile
RUN --mount=type=cache,target=/path/to/cache \
    command
```

### Builds still slow?

**Possible causes**:
1. **Cache miss**: Source code changed, invalidating cache
2. **Cold cache**: First build or cache expired
3. **Large changes**: Major refactoring invalidates most caches
4. **Platform mismatch**: Building for different architecture

**Solutions**:
- Check what files changed (review git diff)
- Review Turbo logs for cache hit/miss reasons
- Consider breaking large changes into smaller PRs

### Cache taking too much space?

GitHub Actions provides 10GB cache storage per repository. If exceeded:

1. Check cache usage in Actions → Caches
2. Delete old/unused caches manually
3. Reduce cache scope by using more specific keys

---

## Cache Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│               GitHub Actions Workflow                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 1. Restore Turbo Cache (.turbo/)                  │  │
│  │    Key: os-turbo-{sha}                            │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 2. Docker Build with BuildKit                     │  │
│  │    ┌─────────────────────────────────────────┐    │  │
│  │    │ Layer Cache (type=gha)                  │    │  │
│  │    │ - Scope: build-linux-amd64              │    │  │
│  │    │ - Scope: yarn-linux-amd64               │    │  │
│  │    └─────────────────────────────────────────┘    │  │
│  │                     ↓                              │  │
│  │    ┌─────────────────────────────────────────┐    │  │
│  │    │ Cache Mounts in Dockerfile              │    │  │
│  │    │ - /root/.yarn/berry/cache (Yarn)        │    │  │
│  │    │ - /app/.turbo (Turbo builds)            │    │  │
│  │    └─────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 3. Save Caches                                    │  │
│  │    - Turbo cache → GitHub Actions cache          │  │
│  │    - Docker layers → GitHub Actions cache        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Next build restores from these caches ♻️
```

---

## Advanced: Cache Debugging

### Enable Turbo Debug Mode

```bash
# Locally
TURBO_LOG_VERBOSITY=debug yarn build

# See why cache was missed
```

### Check Docker BuildKit Cache

```bash
# See what's cached
docker buildx du

# Clear cache if needed
docker buildx prune -a
```

### View GitHub Actions Cache Details

```bash
# Using GitHub CLI
gh cache list

# Delete specific cache
gh cache delete <cache-id>
```

---

## Summary

Our multi-layered caching strategy provides:

- **75-85% faster builds** on cache hits
- **Reduced CI costs** (less compute time)
- **Faster developer feedback** (quicker deployments)
- **Better resource utilization** (less bandwidth, less CPU)

The caches work together:
1. **Docker layers** cache the build environment
2. **Yarn cache** speeds up dependency installation
3. **Turbo cache** skips rebuilding unchanged packages
4. **GitHub Actions cache** persists everything between runs

All caching is automatic and requires no manual intervention! 🚀
