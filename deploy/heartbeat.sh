#!/bin/sh
# Pushes a "still alive" ping to a dead-man's-switch monitor (e.g. healthchecks.io, free tier)
# only when the local stack actually answers healthy — never exposes anything inbound, just an
# outbound call this machine makes on its own schedule. If the machine loses power, loses
# internet, or the backend goes unhealthy, pings stop arriving and the monitor alerts the dev
# team (email/Slack/etc, configured on the monitor's own side) — no port-forwarding, no public
# exposure of this PC required.
#
# Setup:
#   1. Create a free check at https://healthchecks.io (or any compatible dead-man's-switch
#      service) with the expected period matching HEARTBEAT_INTERVAL in the systemd timer below.
#   2. Put its ping URL in HEARTBEAT_URL below (or export it before calling this script).
#   3. Install the systemd timer (see deploy/epoch-heartbeat.timer).
set -e

HEARTBEAT_URL="${HEARTBEAT_URL:-}"
if [ -z "$HEARTBEAT_URL" ]; then
  echo "Set HEARTBEAT_URL (your healthchecks.io ping URL) before running this script." >&2
  exit 1
fi

if curl -fsS -m 10 http://localhost:3000/health | grep -q '"status":"healthy"'; then
  curl -fsS -m 10 "$HEARTBEAT_URL" >/dev/null
else
  # Ping the monitor's /fail endpoint so it alerts immediately instead of waiting out the period.
  curl -fsS -m 10 "$HEARTBEAT_URL/fail" >/dev/null
fi
