#!/bin/sh
# One command to (re)build and launch the whole production stack.
# Safe to run repeatedly: unchanged services are left running, changed ones are rebuilt.
set -e
cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  echo "Missing backend/.env — copy backend/.env.example to backend/.env and fill it in first." >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
