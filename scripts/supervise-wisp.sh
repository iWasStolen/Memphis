#!/usr/bin/env bash
# ============================================================
# Memphis unBLACKed — wisp relay supervisor
#
# Keeps the wisp service (port 3001) alive: restarts it with a
# backoff if it crashes. Logs to mini-services/wisp-service/wisp.log
#
# Usage:  nohup bash scripts/supervise-wisp.sh >> mini-services/wisp-service/supervisor.log 2>&1 &
# Stop :  pkill -f supervise-wisp.sh && pkill -f "wisp-service"
# ============================================================
cd "$(dirname "$0")/.." || exit 1
cd mini-services/wisp-service || exit 1

attempt=0
while true; do
  # already listening? (another instance or a stray process)
  if ss -tln 2>/dev/null | grep -q ":3001 "; then
    echo "[supervisor] port 3001 already in use — waiting"
    sleep 10
    continue
  fi

  attempt=$((attempt + 1))
  echo "[supervisor] starting wisp (attempt $attempt) $(date -Is)"
  bun run start >> wisp.log 2>&1
  code=$?
  echo "[supervisor] wisp exited with code $code $(date -Is)"

  # exponential backoff, capped at 30s
  sleep $(( attempt > 5 ? 30 : attempt * 3 ))
  # reset the backoff after a long-lived run
  if [ $code -eq 0 ]; then attempt=0; fi
done
