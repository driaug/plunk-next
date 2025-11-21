# Multi-stage Dockerfile for Plunk
# Creates a single image containing all applications (API, Worker, Web, Landing, Wiki)
# Use SERVICE environment variable to specify which service to run

# ============================================
# Stage 1: Dependencies
# ============================================
# Use build platform (AMD64) to install dependencies, avoiding QEMU issues
FROM --platform=$BUILDPLATFORM node:20-slim AS deps
ARG TARGETPLATFORM
ARG BUILDPLATFORM
WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Enable Corepack and set Yarn version
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Copy Yarn configuration and release
COPY .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases

# Copy package files for dependency installation
COPY package.json yarn.lock ./

# Copy workspace package.json files
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/landing/package.json ./apps/landing/
COPY apps/wiki/package.json ./apps/wiki/
COPY packages/db/package.json ./packages/db/
COPY packages/ui/package.json ./packages/ui/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json ./packages/types/
COPY packages/email/package.json ./packages/email/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Copy wiki source files for postinstall script (fumadocs-mdx)
COPY apps/wiki/content ./apps/wiki/content
COPY apps/wiki/source.config.ts ./apps/wiki/source.config.ts
COPY apps/wiki/mdx-components.tsx ./apps/wiki/mdx-components.tsx
COPY apps/wiki/next.config.mjs ./apps/wiki/next.config.mjs
COPY apps/wiki/tsconfig.json ./apps/wiki/tsconfig.json

# Install dependencies (runs on build platform, fetches binaries for target platform)
# Use cache mounts for Yarn cache to speed up dependency installation
RUN --mount=type=cache,target=/root/.yarn/berry/cache,sharing=locked \
    --mount=type=cache,target=/root/.cache/yarn,sharing=locked \
    echo "Building on $BUILDPLATFORM for $TARGETPLATFORM" && \
    yarn install --immutable

# ============================================
# Stage 2: Builder
# ============================================
# Builder runs on target platform to generate platform-specific artifacts
FROM node:20-slim AS builder
ARG TARGETPLATFORM
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Enable Corepack and set Yarn version
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.yarn ./.yarn
COPY --from=deps /app/.yarnrc.yml ./
COPY --from=deps /app/package.json ./
COPY --from=deps /app/yarn.lock ./

# Copy source code
COPY . .

# Generate Prisma client
RUN yarn workspace @repo/db db:generate

# Build all packages and applications
# Turbo will handle the dependency graph and build order
# Use cache mount for Turbo cache to speed up builds
RUN --mount=type=cache,target=/app/.turbo,sharing=locked \
    yarn build

# Ensure directories exist (create empty ones if build didn't generate them)
RUN mkdir -p \
    apps/web/public \
    apps/landing/public \
    apps/wiki/public \
    apps/web/.next/standalone \
    apps/landing/.next/standalone \
    apps/wiki/.next/standalone

# ============================================
# Stage 3: Production Runtime
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Enable Corepack and set Yarn version (must be before PM2 install)
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

# Install PM2 globally for process management (when running all services)
RUN npm install -g pm2

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 plunk

# Copy built artifacts from builder
COPY --from=builder --chown=plunk:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=plunk:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=plunk:nodejs /app/apps/landing/.next ./apps/landing/.next
COPY --from=builder --chown=plunk:nodejs /app/apps/wiki/.next ./apps/wiki/.next

# Copy package files
COPY --from=builder --chown=plunk:nodejs /app/package.json ./
COPY --from=builder --chown=plunk:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=plunk:nodejs /app/apps/web/package.json ./apps/web/
COPY --from=builder --chown=plunk:nodejs /app/apps/landing/package.json ./apps/landing/
COPY --from=builder --chown=plunk:nodejs /app/apps/wiki/package.json ./apps/wiki/

# Copy Next.js standalone builds (guaranteed to exist from builder stage)
COPY --from=builder --chown=plunk:nodejs /app/apps/web/.next/standalone ./apps/web/.next/standalone
COPY --from=builder --chown=plunk:nodejs /app/apps/landing/.next/standalone ./apps/landing/.next/standalone
COPY --from=builder --chown=plunk:nodejs /app/apps/wiki/.next/standalone ./apps/wiki/.next/standalone

# Copy static files for Next.js apps
COPY --from=builder --chown=plunk:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=plunk:nodejs /app/apps/landing/public ./apps/landing/public
COPY --from=builder --chown=plunk:nodejs /app/apps/wiki/public ./apps/wiki/public

# Copy node_modules from deps stage (includes all dependencies)
COPY --from=deps --chown=plunk:nodejs /app/node_modules ./node_modules

# Copy Prisma client from builder stage (regenerated with correct ESM format)
COPY --from=builder --chown=plunk:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=plunk:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy shared packages
COPY --from=builder --chown=plunk:nodejs /app/packages ./packages

# Copy Yarn configuration
COPY --from=builder --chown=plunk:nodejs /app/.yarn ./.yarn
COPY --from=builder --chown=plunk:nodejs /app/.yarnrc.yml ./
COPY --from=builder --chown=plunk:nodejs /app/yarn.lock ./

# Copy entrypoint script
COPY --chown=plunk:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER plunk

# Expose ports for all services
# 8080: API, 3000: Web, 4000: Landing, 1000: Wiki
EXPOSE 8080 3000 4000 1000

# Health check (checks if API is running)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Default to running all services via entrypoint
# Can be overridden by setting SERVICE env variable
ENV SERVICE=all

ENTRYPOINT ["docker-entrypoint.sh"]
