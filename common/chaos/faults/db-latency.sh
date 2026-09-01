#!/bin/bash
# Usage: db-latency.sh <ms> [jitter_ms]
# Adds latency to every call through the postgres toxiproxy proxy.
# Requires your app to be connecting via toxiproxy:20000, not postgres:5432
# directly — see toxiproxy-init.sh.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

ms="${1:?usage: db-latency.sh <ms> [jitter_ms]}"
jitter="${2:-0}"
toxiproxy_add_toxic "postgres" "latency-fault" "latency" "{\"latency\":$ms,\"jitter\":$jitter}"
log "added ${ms}ms (+/-${jitter}ms) latency to postgres proxy"
