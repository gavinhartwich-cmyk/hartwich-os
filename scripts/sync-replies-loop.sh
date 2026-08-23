#!/bin/bash
# Phase 4: polls /api/cron/sync-replies every 15 minutes so Gmail replies
# get picked up automatically without opening the app. Runs as a Zo
# "process" service — no public endpoint, just a background loop hitting
# our own production URL with the CRON_SECRET bearer token.
set -euo pipefail

APP_URL="https://hartwich-os-dev-ev0.zocomputer.io"
ENV_FILE="/home/workspace/hartwich-os-work/.env.local"

while true; do
  CRON_SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [ -n "$CRON_SECRET" ]; then
    RESULT=$(curl -s -m 30 -X POST "$APP_URL/api/cron/sync-replies" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Accept: application/json" || echo '{"error":"request_failed"}')
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESULT"
  else
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) CRON_SECRET not set, skipping"
  fi
  sleep 900
done
