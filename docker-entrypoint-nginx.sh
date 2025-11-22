#!/bin/sh
set -e

# Nginx-enabled Docker Entrypoint for Plunk
# Starts all Plunk services with nginx reverse proxy

echo "🚀 Starting Plunk with Nginx reverse proxy..."
echo "📦 Service: ${SERVICE:-all}"

# Only run with SERVICE=all for nginx setup
if [ "$SERVICE" != "all" ]; then
    echo "⚠️  This nginx-enabled image only supports SERVICE=all"
    echo "   For individual services, use the standard Plunk image"
    exit 1
fi

# Run database migrations
echo "🗄️  Running database migrations..."
cd /app
yarn workspace @repo/db migrate:prod || echo "⚠️  Migration failed or already up to date"

# Setup nginx configuration
/app/docker/nginx/setup-nginx.sh

# Generate runtime environment configs for Next.js apps
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
  API_URI: '${API_URI}',
  DASHBOARD_URI: '${DASHBOARD_URI}',
  LANDING_URI: '${LANDING_URI}',
};
EOF
      ;;

    landing)
      cat > "$public_dir/__env.js" << EOF
// Runtime environment configuration
// Generated at container startup from environment variables
window.__ENV__ = {
  API_URI: '${API_URI}',
  DASHBOARD_URI: '${DASHBOARD_URI}',
  LANDING_URI: '${LANDING_URI}',
};
EOF
      ;;

    wiki)
      cat > "$public_dir/__env.js" << EOF
// Runtime environment configuration
// Generated at container startup from environment variables
window.__ENV__ = {
  WIKI_URI: '${WIKI_URI}',
};
EOF
      ;;
  esac

  echo "✅ Generated $public_dir/__env.js"
}

# Generate runtime configs for all apps
generate_runtime_config "web" "/app/apps/web/.next/standalone/public"
generate_runtime_config "landing" "/app/apps/landing/.next/standalone/public"
generate_runtime_config "wiki" "/app/apps/wiki/.next/standalone/public"

echo "📋 Starting services with PM2..."

# Create PM2 ecosystem file
cat > /tmp/ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [
    {
      name: 'nginx',
      script: 'nginx',
      args: '-g "daemon off;"',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false
    },
    {
      name: 'api',
      script: '/app/apps/api/dist/app.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
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
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'web',
      script: 'apps/web/server.js',
      cwd: '/app/apps/web/.next/standalone',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0'
      }
    },
    {
      name: 'landing',
      script: 'apps/landing/server.js',
      cwd: '/app/apps/landing/.next/standalone',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        HOSTNAME: '0.0.0.0'
      }
    },
    {
      name: 'wiki',
      script: 'apps/wiki/server.js',
      cwd: '/app/apps/wiki/.next/standalone',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 1000,
        HOSTNAME: '0.0.0.0'
      }
    }
  ]
};
PMEOF

# Display configuration summary
echo ""
echo "✅ Configuration complete!"
echo ""
echo "🌐 Your Plunk instance will be available at:"
echo "   API: http://${API_DOMAIN}"
echo "   Dashboard: http://${DASHBOARD_DOMAIN}"
echo "   Landing: http://${LANDING_DOMAIN}"
echo "   Docs: http://${WIKI_DOMAIN}"
echo ""
echo "🚀 Starting all services..."
echo ""

# Start all services with PM2
exec pm2-runtime start /tmp/ecosystem.config.js
