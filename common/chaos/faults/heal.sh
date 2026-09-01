#!/bin/bash
# Usage: heal.sh
# Removes every fault this framework knows how to inject: clears all
# toxiproxy toxics, unpauses any paused containers, restarts any stopped
# ones (redis specifically, the common case), resets dep-sim to healthy,
# and kills any background connection-exhaustion psql processes.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

log "clearing toxiproxy toxics..."
for proxy in postgres redis dep-sim; do
  toxiproxy_clear_proxy "$proxy" 2>/dev/null || true
done

log "unpausing any paused containers..."
docker ps -f status=paused --format '{{.Names}}' | grep 'system-design-lab\|infra-' | while read -r c; do
  docker unpause "$c"
done

log "restarting redis if it's stopped..."
docker ps -a -f status=exited --format '{{.Names}}' | grep redis | while read -r c; do
  docker start "$c"
done

log "resetting dep-sim to healthy..."
curl -s -X POST http://localhost:4000/control -H 'Content-Type: application/json' \
  -d '{"failureRate":0,"latencyMs":20,"jitterMs":10}' >/dev/null 2>&1 || true

log "killing background connection-exhaustion holds, if any..."
pkill -f "pg_sleep(120)" 2>/dev/null || true

log "healed."
