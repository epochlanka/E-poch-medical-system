#!/bin/sh
# Scheduled backup to an independent location: the database (pg_dump) + every uploaded file, as two
# timestamped files in BACKUP_DEST, with old ones pruned. Run by epoch-backup.timer once a day, or by
# hand:  ./deploy/backup.sh
#
# Configure in the repo-root .env (see .env.example):
#   BACKUP_DEST              REQUIRED. A directory on a DIFFERENT device than this computer's system
#                            disk — an external drive or a mounted network share. A backup on the same
#                            disk protects against nothing that kills the disk.
#   BACKUP_RETENTION_DAYS    Keep this many days (default 30).
#   BACKUP_PASSPHRASE_FILE   Optional. Path to a file holding a passphrase; backups are encrypted with
#                            AES-256 (openssl) and get a .enc suffix. STRONGLY advised for removable or
#                            cloud media: these files contain patient records.
#   RCLONE_REMOTE            Optional. e.g. "gdrive:epoch-backups" — after the local copy is made it is
#                            also pushed there with rclone (also good with an rclone `crypt` remote).
#   BACKUP_HEARTBEAT_URL     Optional. A dead-man's-switch URL (healthchecks.io). Pinged only on
#                            success, so a backup that silently stops running alerts you.
set -eu
cd "$(dirname "$0")/.."

[ -f .env ] && { set -a; . ./.env; set +a; }

: "${BACKUP_DEST:?Set BACKUP_DEST in .env to a directory on an independent drive/share}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
COMPOSE="docker compose -f docker-compose.prod.yml"
TS="$(date +%Y%m%dT%H%M%S)"

case "$(cd "$BACKUP_DEST" 2>/dev/null && pwd -P || echo "$BACKUP_DEST")/" in
  "$(pwd -P)"/*) echo "BACKUP_DEST is inside the project folder — that is not an independent location." >&2; exit 1 ;;
esac
mkdir -p "$BACKUP_DEST"

encrypt() {
  if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${BACKUP_PASSPHRASE_FILE}"
  else
    cat
  fi
}
EXT=""; [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && EXT=".enc"

DB_FILE="$BACKUP_DEST/database-$TS.dump$EXT"
UPLOADS_FILE="$BACKUP_DEST/uploads-$TS.tar.gz$EXT"

echo "Backing up the database..."
# pg_dump runs inside the backend container (it has the matching PostgreSQL 17 client and the
# connection string); the dump streams out through the encryptor and is never written unencrypted.
$COMPOSE exec -T backend sh -c 'pg_dump --format=custom "$DIRECT_URL"' | encrypt > "$DB_FILE.partial"
mv "$DB_FILE.partial" "$DB_FILE"

echo "Backing up uploaded files..."
tar -czf - -C backend uploads | encrypt > "$UPLOADS_FILE.partial"
mv "$UPLOADS_FILE.partial" "$UPLOADS_FILE"

# A backup you have not read back is a hope, not a backup: prove the dump is a readable archive.
echo "Verifying..."
if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:${BACKUP_PASSPHRASE_FILE}" < "$DB_FILE"
else
  cat "$DB_FILE"
fi | $COMPOSE exec -T backend pg_restore --list > /dev/null
[ -s "$UPLOADS_FILE" ] || { echo "uploads archive is empty" >&2; exit 1; }

echo "Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DEST" -maxdepth 1 \( -name 'database-*.dump*' -o -name 'uploads-*.tar.gz*' \) -type f -mtime "+$RETENTION_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "Copying to $RCLONE_REMOTE..."
  rclone copy "$BACKUP_DEST" "$RCLONE_REMOTE" --include 'database-*' --include 'uploads-*'
fi

echo "Backup complete: $DB_FILE"
[ -n "${BACKUP_HEARTBEAT_URL:-}" ] && curl -fsS -m 15 "$BACKUP_HEARTBEAT_URL" > /dev/null || true
exit 0
