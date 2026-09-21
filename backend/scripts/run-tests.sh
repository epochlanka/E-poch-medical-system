#!/bin/sh
# Runs the backend test suite against a throwaway local PostgreSQL 17 (same major version as
# Supabase) — never against the configured/real database. Usage: npm run test:isolated [-- jest args]
set -e
cd "$(dirname "$0")/.."

NAME=epoch-test-pg
PORT="${TEST_DB_PORT:-55432}"
URL="postgresql://postgres:testpw@localhost:${PORT}/epoch_test"

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=testpw -e POSTGRES_DB=epoch_test -p "${PORT}:5432" postgres:17-alpine >/dev/null
  echo "Waiting for the test database..."
  until docker exec "$NAME" pg_isready -U postgres -d epoch_test >/dev/null 2>&1; do sleep 1; done
  sleep 2
fi

# The backup tests need pg_dump / pg_restore. If the host has no PostgreSQL client tools, provide
# throwaway wrappers that run the same PostgreSQL 17 tools from the container image (host network so
# they reach the test database; /tmp and the project dir mounted at the same paths so file arguments
# resolve identically).
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  TOOLS="$(mktemp -d)"
  for tool in pg_dump pg_restore psql; do
    printf '#!/bin/sh\nexec docker run --rm -i --network host -u "%s:%s" -v /tmp:/tmp -v "%s":"%s" -w "%s" postgres:17-alpine %s "$@"\n' \
      "$(id -u)" "$(id -g)" "$PWD" "$PWD" "$PWD" "$tool" > "$TOOLS/$tool"
    chmod +x "$TOOLS/$tool"
  done
  export PATH="$TOOLS:$PATH"
fi

export TEST_DATABASE_URL="$URL"
DATABASE_URL="$URL" DIRECT_URL="$URL" npx prisma migrate deploy
DATABASE_URL="$URL" DIRECT_URL="$URL" NODE_ENV=test npx tsx prisma/seed-demo.ts >/dev/null
exec npx jest --runInBand --forceExit "$@"
