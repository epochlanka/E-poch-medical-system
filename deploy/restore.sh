#!/bin/sh
# Recovery from a backup. Two modes:
#
#   ./deploy/restore.sh --drill  <backup> [--target-url postgresql://...]
#       Restores into a SEPARATE, EMPTY database and compares it against the backup. Touches nothing
#       live. Do this on a schedule (and after any change to how backups are made) — a backup is only
#       proven by restoring it. Refuses to run if the target is the live database.
#
#   ./deploy/restore.sh --live   <backup>
#       Real disaster recovery. Takes a safety dump of what is there now, STOPS the application,
#       restores the database inside ONE transaction (all-or-nothing — a failure leaves the current
#       data untouched, never a half-restored database), restores the uploaded files, restarts, and
#       runs the security check. Requires typing a confirmation phrase.
#
# <backup> is either:
#   - a file downloaded from Settings > Backups (backup-*.tar: database + uploads together), or
#   - a pair made by deploy/backup.sh:  "database-<ts>.dump[.enc],uploads-<ts>.tar.gz[.enc]"
#     (comma-separated, no spaces). Encrypted (.enc) files need BACKUP_PASSPHRASE_FILE in .env.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

MODE="${1:-}"; BACKUP="${2:-}"; TARGET_URL=""
[ "${3:-}" = "--target-url" ] && TARGET_URL="${4:-}"
case "$MODE" in --drill|--live) ;; *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;; esac
[ -n "$BACKUP" ] || { echo "Missing <backup>." >&2; exit 2; }

COMPOSE="docker compose -f docker-compose.prod.yml"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
START="$(date +%s)"

decrypt_to() { # $1 = source file, $2 = destination
  case "$1" in
    *.enc) : "${BACKUP_PASSPHRASE_FILE:?This backup is encrypted: set BACKUP_PASSPHRASE_FILE in .env}"
           openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:${BACKUP_PASSPHRASE_FILE}" < "$1" > "$2" ;;
    *) cp "$1" "$2" ;;
  esac
}

# ── Stage the backup as $STAGE/database.dump + $STAGE/uploads/ ─────────────────────────────────
case "$BACKUP" in
  *,*)
    DB_SRC="${BACKUP%%,*}"; UP_SRC="${BACKUP#*,}"
    decrypt_to "$DB_SRC" "$STAGE/database.dump"
    decrypt_to "$UP_SRC" "$STAGE/uploads.tar.gz"
    tar -xzf "$STAGE/uploads.tar.gz" -C "$STAGE" ;;
  *.tar)
    tar -xf "$BACKUP" -C "$STAGE" ;;
  *) echo "Unrecognised backup: expected backup-*.tar or 'database-...,uploads-...'." >&2; exit 2 ;;
esac
[ -s "$STAGE/database.dump" ] || { echo "The backup contains no database.dump." >&2; exit 1; }
[ -d "$STAGE/uploads" ] || mkdir "$STAGE/uploads"

IMAGE="$($COMPOSE images -q backend | head -n 1)"
[ -n "$IMAGE" ] || { echo "The backend image is not built yet (run ./deploy/launch.sh first)." >&2; exit 1; }
tools() { docker run --rm --network host --entrypoint sh -v "$STAGE:/restore:ro" -e "PGCONNECT_TIMEOUT=30" "$@"; }

host_of() { printf '%s' "$1" | sed -E 's#^[a-z]+://[^@]*@##; s#[:/?].*##'; }
live_url="$(grep -E '^DIRECT_URL=' backend/.env | head -n1 | cut -d= -f2-)"

# ── DRILL ──────────────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "--drill" ]; then
  [ -n "$TARGET_URL" ] || { echo "--drill needs --target-url for an isolated EMPTY database (e.g. a throwaway local Postgres)." >&2; exit 2; }
  if [ "$(host_of "$TARGET_URL")" = "$(host_of "$live_url")" ]; then
    echo "REFUSING: the target is on the same database host as the live system. A drill must use a separate, isolated database." >&2; exit 1
  fi

  echo "Restoring into the isolated target..."
  tools "$IMAGE" -c 'pg_restore --exit-on-error --single-transaction --no-owner --dbname "$1" /restore/database.dump' sh "$TARGET_URL"

  echo "Checking the restored database..."
  tools -e "DATABASE_URL=$TARGET_URL" -e "DIRECT_URL=$TARGET_URL" "$IMAGE" -c 'node scripts/check-db-security.js'
  tools "$IMAGE" -c 'psql "$1" -Atc "select '"'"'users'"'"', count(*) from \"User\" union all select '"'"'patients'"'"', count(*) from \"Patient\" union all select '"'"'prescriptions'"'"', count(*) from \"Prescription\" union all select '"'"'invoices'"'"', count(*) from \"Invoice\" union all select '"'"'payments'"'"', count(*) from \"Payment\""' sh "$TARGET_URL" 2>/dev/null || true
  echo "Uploaded files in the backup: $(find "$STAGE/uploads" -type f | wc -l)"
  echo "Drill complete in $(( $(date +%s) - START ))s — this is your measured recovery time for a database of this size."
  exit 0
fi

# ── LIVE ───────────────────────────────────────────────────────────────────────────────────────
echo "This will REPLACE the live database and all uploaded files with the contents of:"
echo "    $BACKUP"
echo "The application will be stopped while this runs. Anything entered since that backup was taken"
echo "will be lost (a safety copy of the current state is saved first)."
printf 'Type RESTORE LIVE DATABASE to continue: '
read -r CONFIRM
[ "$CONFIRM" = "RESTORE LIVE DATABASE" ] || { echo "Cancelled."; exit 1; }

TS="$(date +%Y%m%dT%H%M%S)"
SAFETY="backend/backups/pre-restore-$TS.dump"
mkdir -p backend/backups
echo "Saving a safety dump of the CURRENT database to $SAFETY ..."
$COMPOSE exec -T backend sh -c 'pg_dump --format=custom "$DIRECT_URL"' > "$SAFETY"
[ -s "$SAFETY" ] || { echo "Safety dump is empty — aborting before anything is changed." >&2; exit 1; }

echo "Stopping the application..."
$COMPOSE stop backend

echo "Restoring the database (single transaction: it either fully succeeds or changes nothing)..."
if ! $COMPOSE run --rm --no-deps --entrypoint sh -v "$STAGE:/restore:ro" backend -c \
     'pg_restore --exit-on-error --single-transaction --clean --if-exists --no-owner --dbname "$DIRECT_URL" /restore/database.dump'; then
  echo "RESTORE FAILED — the database was left exactly as it was. Restarting the application." >&2
  $COMPOSE up -d
  exit 1
fi

echo "Restoring uploaded files..."
if [ -d backend/uploads ]; then mv backend/uploads "backend/uploads.before-restore-$TS"; fi
cp -a "$STAGE/uploads" backend/uploads

echo "Revoking every session (the restored database brings back old ones)..."
$COMPOSE run --rm --no-deps --entrypoint sh backend -c \
  'node -e "const {PrismaClient}=require(\"@prisma/client\");const p=new PrismaClient();p.userSession.updateMany({where:{revoked_at:null},data:{revoked_at:new Date()}}).then(r=>{console.log(\"sessions revoked:\",r.count);return p.\$disconnect()})"'

echo "Starting the application..."
$COMPOSE up -d
$COMPOSE run --rm --no-deps --entrypoint sh backend -c 'node scripts/check-db-security.js'

echo
echo "Restored in $(( $(date +%s) - START ))s."
echo "  - Previous uploads kept at backend/uploads.before-restore-$TS ; previous database at $SAFETY"
echo "  - Settings > Backups now lists the backups that existed AT THE RESTORED POINT IN TIME; backup files"
echo "    made since then are still on disk in backend/backups but are not listed."
echo "  - Everyone must sign in again."
