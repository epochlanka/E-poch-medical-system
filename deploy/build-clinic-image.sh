#!/bin/sh
# Build one offline-transferable image and place it with the clinic runtime files.
set -eu

cd "$(dirname "$0")/.."

output_dir="${1:-deploy/transfer}"
platform="${PLATFORM:-linux/amd64}"
# Pinned so the clinic always gets the same database version, and so this is the exact image
# saved into the bundle below. Must stay on PostgreSQL 17 to match the client in the app image.
postgres_image="${POSTGRES_IMAGE:-postgres:17-alpine}"

# Never mix a new release with an older transfer directory. In particular, an existing
# clinic.env can contain live credentials and must not be silently carried into a new bundle.
if [ -e "$output_dir" ] && [ -n "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
  echo "Refusing to build into non-empty directory: $output_dir" >&2
  echo "Move the old bundle to a secure archive, or pass a new empty output directory." >&2
  exit 1
fi

mkdir -p "$output_dir"

echo "Building epoch-medical:clinic for $platform ..."
docker build --platform "$platform" -f Dockerfile.clinic -t epoch-medical:clinic .

# The clinic machine has no internet, so the database image has to travel in the bundle too —
# otherwise `docker compose up` tries to pull it and the whole install stalls at the first run.
echo "Fetching $postgres_image for $platform ..."
docker pull --platform "$platform" "$postgres_image"

echo "Exporting both images (this file will be large) ..."
docker image save -o "$output_dir/epoch-medical-clinic.tar" epoch-medical:clinic "$postgres_image"
cp deploy/docker-compose.clinic.yml "$output_dir/docker-compose.yml"
cp deploy/clinic.env.example "$output_dir/clinic.env.example"
cp deploy/start-clinic.sh "$output_dir/start-clinic.sh"
# The clinic machine has no checkout of this repository, so the backup tooling has to travel with
# the install. Without a managed database behind it, these are the only copies of the records.
cp deploy/backup.sh deploy/restore.sh "$output_dir/"
cp deploy/epoch-backup.service deploy/epoch-backup.timer "$output_dir/"
chmod +x "$output_dir/start-clinic.sh" "$output_dir/backup.sh" "$output_dir/restore.sh"

(cd "$output_dir" && sha256sum epoch-medical-clinic.tar > epoch-medical-clinic.tar.sha256)

echo ""
echo "Transfer this directory to the Ubuntu clinic machine: $output_dir"
echo "There, copy clinic.env.example to clinic.env, fill it in, then run:"
echo "  ./start-clinic.sh admin     # first install: also creates the administrator"
echo "  ./start-clinic.sh           # afterwards"
