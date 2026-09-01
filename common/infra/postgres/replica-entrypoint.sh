#!/bin/bash
# Custom entrypoint for the read replica. On FIRST boot (empty data dir), it
# clones the primary's data via pg_basebackup and marks itself as a standby.
# On every boot after that, PGDATA already has standby.signal in it, so it
# skips straight to starting Postgres normally in standby mode.
set -e

if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  echo "[replica] empty data dir — cloning from primary via pg_basebackup..."
  export PGPASSWORD=replpass
  pg_basebackup -h postgres -D "$PGDATA" -U replicator -Fp -Xs -P -R
  # -R writes standby.signal + primary_conninfo automatically — that's what
  # tells Postgres on next start "I am a replica, follow this primary."
  echo "[replica] clone complete."
fi

exec docker-entrypoint.sh postgres -c hot_standby=on
