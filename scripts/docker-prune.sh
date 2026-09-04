#!/usr/bin/env bash
#
# scripts/docker-prune.sh
#
# Weekly Docker cleanup: dangling images + stale build cache only.
# Deliberately does NOT touch volumes (`docker volume prune` / `--volumes`),
# so your Postgres/Redis/RabbitMQ data is never at risk from an unattended
# job. Run this manually any time, or schedule it (see bottom of this file).

set -euo pipefail

LOG_DIR="${HOME}/.docker-prune-logs"
LOG_FILE="${LOG_DIR}/prune-$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

{
  echo "=== Docker prune: $(date) ==="
  echo "--- Before ---"
  docker system df

  docker image prune -af
  docker builder prune -af

  echo "--- After ---"
  docker system df
  echo "=== Done ==="
} >> "$LOG_FILE" 2>&1

# Keep only the last 8 weeks of logs so the logs themselves don't accumulate.
find "$LOG_DIR" -name 'prune-*.log' -mtime +56 -delete

# -----------------------------------------------------------------------------
# Scheduling (pick whichever matches your dev machine — you only need one):
#
# Linux / macOS via cron:
#   crontab -e
#   # then add (runs every Sunday at 3am):
#   0 3 * * 0 /bin/bash /absolute/path/to/scripts/docker-prune.sh
#
# macOS via launchd (more reliable than cron if your laptop sleeps a lot —
# launchd will run missed jobs on wake):
#   Create ~/Library/LaunchAgents/com.yourapp.docker-prune.plist:
#
#   <?xml version="1.0" encoding="UTF-8"?>
#   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
#     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
#   <plist version="1.0">
#   <dict>
#     <key>Label</key><string>com.yourapp.docker-prune</string>
#     <key>ProgramArguments</key>
#     <array>
#       <string>/bin/bash</string>
#       <string>/absolute/path/to/scripts/docker-prune.sh</string>
#     </array>
#     <key>StartCalendarInterval</key>
#     <dict>
#       <key>Weekday</key><integer>0</integer>
#       <key>Hour</key><integer>3</integer>
#       <key>Minute</key><integer>0</integer>
#     </dict>
#     <key>RunAtLoad</key><false/>
#   </dict>
#   </plist>
#
#   Then load it:
#     launchctl load ~/Library/LaunchAgents/com.yourapp.docker-prune.plist
#
# Windows via Task Scheduler (PowerShell, run as the user who runs Docker):
#   $action  = New-ScheduledTaskAction -Execute "docker" `
#                -Argument "image prune -af; docker builder prune -af"
#   $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am
#   Register-ScheduledTask -TaskName "DockerWeeklyPrune" `
#                -Action $action -Trigger $trigger
# -----------------------------------------------------------------------------
