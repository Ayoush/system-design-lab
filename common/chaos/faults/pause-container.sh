#!/bin/bash
# Usage: pause-container.sh <name-substring>
# Freezes a container's process (SIGSTOP-like) — simulates it hanging /
# becoming completely unresponsive without actually dying. Different failure
# mode than kill: connections stay open but nothing responds, which is a
# much nastier case for timeouts/retries to handle.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$DIR/lib.sh"

target="$(find_container "$1")"
[ -z "$target" ] && { echo "no running container matches '$1'"; exit 1; }
log "pausing $target — use 'lab heal' or unpause-container.sh to restore"
docker pause "$target"
