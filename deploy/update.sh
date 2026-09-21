#!/bin/sh
# One command for the dev team to ship a new version to a deployed pharmacy PC.
# Run this over SSH (e.g. via Tailscale) on the target machine:
#   ssh pharmacy-front-desk './E-poch-medical-system/deploy/update.sh'
set -e
cd "$(dirname "$0")/.."

BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Updating branch '$BRANCH'..."
git fetch origin
git merge --ff-only "origin/$BRANCH"

./deploy/launch.sh
