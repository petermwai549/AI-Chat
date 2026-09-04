#!/usr/bin/env bash
#
# scripts/frontend-idle-stop.sh
#
# Stops the frontend dev container if nothing has connected to port 5270
# across several consecutive checks — i.e. you (or Apache on your behalf)
# haven't actually been using it for a while. Safe to run frequently: it
# only ever stops the container, never deletes anything, and `devup` (or
# `docker compose start frontend`) brings it right back.
#
# How it works: counts established TCP connections to :5270 each run. If
# that count is zero for IDLE_THRESHOLD consecutive runs in a row, it stops
# the container and resets the counter.

set -euo pipefail

CONTAINER_NAME="frontend"
STATE_FILE="${HOME}/.frontend-idle-count"
IDLE_THRESHOLD=8   # e.g. 8 checks x 15min cron interval = ~2 hours idle

# If the container isn't running, there's nothing to do.
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

active_connections=$(ss -tn state established '( dport = :5270 or sport = :5270 )' 2>/dev/null | grep -c . || true)
# subtract 1 for ss's header line if present
if [ "$active_connections" -gt 0 ]; then
  active_connections=$((active_connections - 1))
fi

idle_count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

if [ "$active_connections" -gt 0 ]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

idle_count=$((idle_count + 1))
echo "$idle_count" > "$STATE_FILE"

if [ "$idle_count" -ge "$IDLE_THRESHOLD" ]; then
  docker stop "$CONTAINER_NAME"
  echo 0 > "$STATE_FILE"
  echo "$(date): stopped $CONTAINER_NAME after $IDLE_THRESHOLD idle checks" >> "${HOME}/.frontend-idle-stop.log"
fi

# -----------------------------------------------------------------------------
# Schedule via cron, checking every 15 minutes:
#
#   crontab -e
#   */15 * * * * /bin/bash /absolute/path/to/scripts/frontend-idle-stop.sh
#
# Adjust IDLE_THRESHOLD above to change how long it waits before stopping
# (threshold x cron interval = idle time before shutdown).
# -----------------------------------------------------------------------------
