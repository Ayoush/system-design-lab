#!/bin/bash
# Shared helpers for every fault script in common/chaos/faults/*.sh.
# Source this at the top of a fault script: source "$(dirname "$0")/../lib.sh"

TOXIPROXY_API="http://localhost:8474"

# Find a running container whose name contains a substring, e.g. "postgres"
# matches "system-design-lab-postgres-1" regardless of compose project name.
find_container() {
  docker ps --format '{{.Names}}' | grep -m1 "$1" || true
}

# Register a toxiproxy proxy if it doesn't already exist. Idempotent — safe
# to call every time, won't error on a proxy that's already there.
toxiproxy_ensure_proxy() {
  local name="$1" listen="$2" upstream="$3"
  curl -s -o /dev/null "$TOXIPROXY_API/proxies/$name" -w '%{http_code}' | grep -q 200 && return 0
  curl -s -X POST "$TOXIPROXY_API/proxies" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"listen\":\"0.0.0.0:$listen\",\"upstream\":\"$upstream\"}" >/dev/null
}

# Add a toxic (fault) to a proxy. type = latency|bandwidth|timeout|slow_close|reset_peer|slicer
toxiproxy_add_toxic() {
  local proxy="$1" name="$2" type="$3" attrs="$4"
  curl -s -X POST "$TOXIPROXY_API/proxies/$proxy/toxics" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"type\":\"$type\",\"attributes\":$attrs}"
}

# Remove every toxic from a proxy — used by heal.sh
toxiproxy_clear_proxy() {
  local proxy="$1"
  curl -s "$TOXIPROXY_API/proxies/$proxy/toxics" | jq -r '.[].name' 2>/dev/null | while read -r toxic; do
    curl -s -X DELETE "$TOXIPROXY_API/proxies/$proxy/toxics/$toxic" >/dev/null
  done
}

log() { echo "[chaos] $*"; }
