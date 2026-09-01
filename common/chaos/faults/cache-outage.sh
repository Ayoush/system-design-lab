#!/bin/bash
# Usage: cache-outage.sh
# Stops redis entirely — every cache lookup will fail/timeout, exactly
# reproducing a cache-miss-storm scenario. Restore with heal.sh.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

target="$(find_container "redis")"
[ -z "$target" ] && { echo "no running redis container"; exit 1; }
log "stopping $target"
docker stop "$target"
