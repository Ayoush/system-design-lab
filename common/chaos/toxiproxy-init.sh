#!/bin/bash
# Run once after toxiproxy.yml is up, before you want fault injection
# available. Registers a proxy for every dependency we might want to
# inject faults into. Idempotent — safe to re-run.
#
# IMPORTANT: your app must be configured to connect through these proxy
# ports (e.g. DATABASE_URL pointing at toxiproxy:20000) for faults on that
# dependency to have any effect. Connecting straight to postgres:5432
# bypasses toxiproxy entirely — that's a deliberate per-experiment choice,
# not a default, since you don't want every experiment paying proxy hop
# latency by default.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/lib.sh"

log "registering proxies..."
toxiproxy_ensure_proxy "postgres" 20000 "postgres:5432"
toxiproxy_ensure_proxy "redis"    20001 "redis:6379"
toxiproxy_ensure_proxy "dep-sim"  20002 "dep-sim:4000"
log "done. proxies listen on toxiproxy:20000 (pg), :20001 (redis), :20002 (dep-sim)"
