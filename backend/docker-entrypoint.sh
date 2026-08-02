#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Pushing database schema..."
npx prisma db push --accept-data-loss

echo "Seeding database if needed..."
npx prisma db seed

echo ""
echo "====================================================="
echo "🟢 Backend API is running at: http://localhost:3000"
echo "====================================================="
echo ""

echo "Starting application..."
exec "$@"
