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
      script: 'yarn',
      args: 'start',
      cwd: '/app/apps/web',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'landing',
      script: 'yarn',
      args: 'start',
      cwd: '/app/apps/landing',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'wiki',
      script: 'yarn',
      args: 'start',
      cwd: '/app/apps/wiki',
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
