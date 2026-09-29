#!/bin/sh
set -eu

# Keep both long-running processes under one small PID-1 supervisor. If either nginx or the
# backend exits, this script terminates the other and exits so Docker's restart policy can recover
# the complete application rather than leaving a half-working container alive.
nginx -t
nginx -g 'daemon off;' &
nginx_pid=$!

backend_pid=""
watchdog_pid=""

shutdown() {
  trap - TERM INT
  [ -z "$watchdog_pid" ] || kill -TERM "$watchdog_pid" 2>/dev/null || true
  [ -z "$backend_pid" ] || kill -TERM "$backend_pid" 2>/dev/null || true
  kill -TERM "$nginx_pid" 2>/dev/null || true
  [ -z "$watchdog_pid" ] || wait "$watchdog_pid" 2>/dev/null || true
  [ -z "$backend_pid" ] || wait "$backend_pid" 2>/dev/null || true
  wait "$nginx_pid" 2>/dev/null || true
}

trap 'shutdown; exit 0' TERM INT

while kill -0 "$nginx_pid" 2>/dev/null; do
  backend-entrypoint "$@" &
  backend_pid=$!

  # If nginx dies, stop the backend so the wait below finishes and the container can exit.
  (
    while kill -0 "$nginx_pid" 2>/dev/null; do sleep 2; done
    kill -TERM "$backend_pid" 2>/dev/null || true
  ) &
  watchdog_pid=$!

  set +e
  wait "$backend_pid"
  status=$?
  set -e

  kill -TERM "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  watchdog_pid=""
  backend_pid=""

  if ! kill -0 "$nginx_pid" 2>/dev/null; then
    shutdown
    [ "$status" -ne 0 ] || status=1
    exit "$status"
  fi

  echo "Backend exited with status $status; retrying in 10 seconds..." >&2
  sleep 10
done

shutdown
exit 1
