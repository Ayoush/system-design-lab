#!/bin/bash
# Usage: dep-fail.sh <rate 0.0-1.0> [latency_ms] [jitter_ms]
# Talks to dep-sim's own /control endpoint directly (no toxiproxy needed —
# dep-sim has this behavior built in). Live-updates without a restart.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

rate="${1:?usage: dep-fail.sh <rate 0.0-1.0> [latency_ms] [jitter_ms]}"
latency="${2:-20}"
jitter="${3:-10}"
curl -s -X POST http://localhost:4000/control \
  -H 'Content-Type: application/json' \
  -d "{\"failureRate\":$rate,\"latencyMs\":$latency,\"jitterMs\":$jitter}"
echo
log "dep-sim now failing ${rate} of calls, ${latency}ms +/-${jitter}ms latency"
