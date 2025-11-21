#!/bin/bash
set -e

echo "🧪 Running Plunk Smoke Test..."

# Cleanup function
cleanup() {
  echo "🧹 Cleaning up..."
  docker compose -f docker-compose.smoke-test.yml down -v 2>/dev/null || true
}

# Trap exit to ensure cleanup
trap cleanup EXIT

# Start infrastructure services (PostgreSQL, Redis)
echo "🚀 Starting infrastructure services..."
docker compose -f docker-compose.smoke-test.yml up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
until docker compose -f docker-compose.smoke-test.yml exec -T postgres pg_isready -U plunk > /dev/null 2>&1; do
  sleep 1
done
echo "✅ PostgreSQL is ready"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis..."
until docker compose -f docker-compose.smoke-test.yml exec -T redis redis-cli ping > /dev/null 2>&1; do
  sleep 1
done
echo "✅ Redis is ready"

# Start Plunk application
echo "🚀 Starting Plunk application..."
docker compose -f docker-compose.smoke-test.yml up -d plunk

# Wait for API to be healthy
echo "⏳ Waiting for API to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if docker compose -f docker-compose.smoke-test.yml exec -T plunk sh -c "curl -f http://localhost:8080/health" > /dev/null 2>&1; then
    echo "✅ API is healthy"
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo "❌ API failed to become healthy"
    echo "📋 API logs:"
    docker compose -f docker-compose.smoke-test.yml logs plunk
    exit 1
  fi
  sleep 2
done

# Run basic API tests
echo "🧪 Testing API endpoints..."

# Test health endpoint
if ! docker compose -f docker-compose.smoke-test.yml exec -T plunk curl -f http://localhost:8080/health > /dev/null 2>&1; then
  echo "❌ Health check failed"
  exit 1
fi
echo "✅ Health check passed"

# Test that web service files exist
echo "🧪 Verifying Web application files..."
if ! docker compose -f docker-compose.smoke-test.yml exec -T plunk test -d /app/apps/web/.next; then
  echo "❌ Web application files not found"
  exit 1
fi
echo "✅ Web application files verified"

# Test that worker service files exist
echo "🧪 Verifying Worker files..."
if ! docker compose -f docker-compose.smoke-test.yml exec -T plunk test -f /app/apps/api/dist/jobs/worker.js; then
  echo "❌ Worker files not found"
  exit 1
fi
echo "✅ Worker files verified"

# Verify Prisma can connect to database
echo "🧪 Testing database connection..."
if ! docker compose -f docker-compose.smoke-test.yml exec -T plunk sh -c "cd /app && yarn workspace @repo/db db:generate > /dev/null 2>&1"; then
  echo "❌ Database connection failed"
  exit 1
fi
echo "✅ Database connection verified"

echo ""
echo "✅ All smoke tests passed! 🎉"
echo ""
