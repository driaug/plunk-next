#!/bin/sh
set -e

# Plunk Docker Entrypoint Script
# Launches different services based on SERVICE environment variable
# Usage: SERVICE=<service> docker run plunk
# Services: api, worker, web, landing, wiki, all

echo "🚀 Starting Plunk..."
echo "📦 Service: ${SERVICE:-all}"

# Run database migrations on startup (only for api and all)
if [ "$SERVICE" = "api" ] || [ "$SERVICE" = "all" ]; then
  echo "🗄️  Running database migrations..."
  cd /app
  yarn workspace @repo/db migrate:prod || echo "⚠️  Migration failed or already up to date"
fi

# Generate runtime environment configuration for Next.js apps
# This allows environment variables to be changed at runtime in Docker
generate_runtime_config() {
  local app=$1
  local public_dir=$2

  echo "📝 Generating runtime config for $app..."

  case "$app" in
    web)
      cat > "$public_dir/__env.js" << EOF
// Runtime environment configuration
// Generated at container startup from environment variables
window.__ENV__ = {
  API_URI: '${API_URI:-http://localhost:8080}',
  DASHBOARD_URI: '${DASHBOARD_URI:-http://localhost:3000}',
  LANDING_URI: '${LANDING_URI:-http://localhost:4000}',
};
EOF
      ;;

    landing)
      cat > "$public_dir/__env.js" << EOF
// Runtime environment configuration
// Generated at container startup from environment variables
window.__ENV__ = {
  API_URI: '${API_URI:-http://localhost:8080}',
  DASHBOARD_URI: '${DASHBOARD_URI:-http://localhost:3000}',
  LANDING_URI: '${LANDING_URI:-http://localhost:4000}',
  BACKOFFICE_URI: '${BACKOFFICE_URI:-http://localhost:2000}',
};
EOF
      ;;

    wiki)
      cat > "$public_dir/__env.js" << EOF
// Runtime environment configuration
// Generated at container startup from environment variables
window.__ENV__ = {
  WIKI_URI: '${WIKI_URI:-http://localhost:1000}',
};
EOF
      ;;
  esac

  echo "✅ Generated $public_dir/__env.js"
}

# Generate runtime configs based on which service is starting
if [ "$SERVICE" = "web" ] || [ "$SERVICE" = "all" ]; then
  generate_runtime_config "web" "/app/apps/web/public"
fi

if [ "$SERVICE" = "landing" ] || [ "$SERVICE" = "all" ]; then
  generate_runtime_config "landing" "/app/apps/landing/public"
fi

if [ "$SERVICE" = "wiki" ] || [ "$SERVICE" = "all" ]; then
  generate_runtime_config "wiki" "/app/apps/wiki/public"
fi

case "$SERVICE" in
  api)
    echo "🌐 Starting API server on port 8080..."
    cd /app
    exec node apps/api/dist/app.js
    ;;

  worker)
    echo "⚙️  Starting background worker..."
    cd /app
    exec node apps/api/dist/jobs/worker.js
    ;;

  web)
    echo "💻 Starting web dashboard on port 3000..."
    cd /app/apps/web
    exec yarn start
    ;;

  landing)
    echo "🏠 Starting landing page on port 4000..."
    cd /app/apps/landing
    exec yarn start
    ;;

  wiki)
    echo "📚 Starting documentation site on port 1000..."
    cd /app/apps/wiki
    exec yarn start
    ;;

  all)
    echo "🎯 Starting all services with PM2..."

    # Create PM2 ecosystem file
    cat > /tmp/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'api',
      script: '/app/apps/api/dist/app.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      }
    },
    {
      name: 'worker',
      script: '/app/apps/api/dist/jobs/worker.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'web',
      script: '/app/apps/web/.next/standalone/apps/web/server.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'landing',
      script: '/app/apps/landing/.next/standalone/apps/landing/server.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'wiki',
      script: '/app/apps/wiki/.next/standalone/apps/wiki/server.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 1000
      }
    }
  ]
};
EOF

    # Start all services with PM2
    exec pm2-runtime start /tmp/ecosystem.config.js
    ;;

  *)
    echo "❌ Unknown service: $SERVICE"
    echo "Valid services: api, worker, web, landing, wiki, all"
    exit 1
    ;;
esac
