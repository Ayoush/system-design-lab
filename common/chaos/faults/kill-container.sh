#!/bin/bash
# Usage: kill-container.sh <name-substring>
# Hard-kills a running container — simulates an instance crashing.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

target="$(find_container "$1")"
[ -z "$target" ] && { echo "no running container matches '$1'"; exit 1; }
log "killing $target"
docker kill "$target"
