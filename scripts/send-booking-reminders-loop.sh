#!/bin/bash
# Phase 6: polls /api/cron/send-reminders every 15 minutes so booking
# reminder emails/texts go out without opening the app. Same shape as
# sync-replies-loop.sh — a Zo "process" service, no public endpoint, just
# a background loop hitting our own production URL with CRON_SECRET.
set -euo pipefail

APP_URL="https://hartwich-os-dev-ev0.zocomputer.io"
ENV_FILE="/home/workspace/hartwich-os-work/.env.local"

while true; do
  CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [ -n "$CRON_SECRET" ]; then
    RESULT=$(curl -s -m 30 -X POST "$APP_URL/api/cron/send-reminders" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Accept: application/json" || echo '{"error":"request_failed"}')
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESULT"
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) CRON_SECRET not set, skipping"
  fi
  sleep 900
done
