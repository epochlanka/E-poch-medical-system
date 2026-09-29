#!/bin/sh
# Run from the transferred directory on the Ubuntu clinic machine.
set -eu

cd "$(dirname "$0")"

if [ ! -f clinic.env ]; then
  echo "Missing clinic.env — copy clinic.env.example to clinic.env and fill it in first." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' clinic.env; then
  echo "clinic.env still contains CHANGE_ME values." >&2
  exit 1
fi

# The database password appears in three places in clinic.env and they must agree, or the app
# starts and then fails to authenticate against its own database with a confusing error.
pg_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' clinic.env | tail -n 1)"
if [ -n "$pg_password" ] && ! grep -q "://[^:]*:${pg_password}@db:5432/" clinic.env; then
  echo "POSTGRES_PASSWORD does not match the password inside DATABASE_URL/DIRECT_URL." >&2
  echo "All three must carry the same value (URL-encode any special characters)." >&2
  exit 1
fi

# data/postgres holds the clinic's entire database. Everything the installation owns now lives
# under ./data — which is also what backup.sh must be pointed at.
mkdir -p data/uploads data/backups data/logs data/postgres
chmod 700 data

if [ -f epoch-medical-clinic.tar ]; then
  sha256sum -c epoch-medical-clinic.tar.sha256
  # Carries both the application image and PostgreSQL, so this works with no internet.
  docker image load -i epoch-medical-clinic.tar
fi

docker compose -f docker-compose.yml up -d

health_of() {
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' \
    "$(docker compose -f docker-compose.yml ps -q "$1")" 2>/dev/null || true
}

echo "Waiting for the database ..."
attempt=0
db_status=""
while [ "$attempt" -lt 30 ]; do
  db_status="$(health_of db)"
  [ "$db_status" = healthy ] && break
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$db_status" != healthy ]; then
  echo "The database did not start. Recent logs:" >&2
  docker compose -f docker-compose.yml logs --tail=40 db
  exit 1
fi

echo "Waiting for the application to become healthy ..."
attempt=0
status=""
while [ "$attempt" -lt 36 ]; do
  status="$(health_of epoch-medical)"
  if [ "$status" = healthy ]; then
    break
  fi
  if [ "$status" = unhealthy ]; then
    echo "The application is unhealthy. Recent logs:" >&2
    docker compose -f docker-compose.yml logs --tail=80
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 5
done

if [ "$status" != healthy ]; then
  echo "The application did not become healthy in time. Recent logs:" >&2
  docker compose -f docker-compose.yml logs --tail=80
  exit 1
fi

site_host="$(sed -n 's/^SITE_HOST=//p' clinic.env | tail -n 1)"
echo ""
echo "E-Poch is running:"
echo "  Open http://$site_host:5173 on any clinic PC and sign in."
echo "  Everyone uses that one address; the workspace that opens follows the account's role."

if [ "${1:-}" = admin ]; then
  printf "Admin username [admin]: "
  read -r admin_username
  admin_username="${admin_username:-admin}"
  printf "Admin password (at least 12 characters): "
  stty -echo
  read -r admin_password
  stty echo
  printf '\n'
  docker compose -f docker-compose.yml exec \
    -e ADMIN_USERNAME="$admin_username" -e ADMIN_PASSWORD="$admin_password" \
    epoch-medical node scripts/bootstrap-production.js
else
  # A brand-new local database has no accounts at all, so nobody can sign in until this is run.
  user_count="$(docker compose -f docker-compose.yml exec -T db \
    sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from \"User\""' 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$user_count" = 0 ]; then
    echo ""
    echo "This database has no accounts yet — nobody can sign in."
    echo "Create the first administrator with:  ./start-clinic.sh admin"
  fi
fi
