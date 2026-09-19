#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

if [ "$NODE_ENV" = "production" ]; then
  # Production never uses `db push --accept-data-loss` or auto-seeding: schema changes go
  # through reviewed migrations only, and demo data must never touch a real pharmacy's DB.
  echo "Applying database migrations (prisma migrate deploy)..."
  npx prisma migrate deploy
else
  echo "Pushing database schema..."
  npx prisma db push --accept-data-loss

  echo "Seeding database if needed..."
  npx prisma db seed
fi

echo ""
echo "====================================================="
echo "🟢 Backend API is running at: http://localhost:3000"
echo "====================================================="
echo ""

echo "Starting application..."

if [ "$NODE_ENV" = "production" ]; then
  # The production image starts as root so bind-mounted host folders (uploads/backups/logs —
  # whatever ownership the host happens to give them) can be handed to the unprivileged
  # `appuser` at boot, then it drops root before actually running the app.
  chown -R appuser:appgroup uploads backups logs
  exec su-exec appuser "$@"
else
  exec "$@"
fi
