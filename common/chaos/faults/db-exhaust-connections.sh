#!/bin/bash
# Usage: db-exhaust-connections.sh [count]
# Opens N idle connections directly to postgres and holds them open in the
# background (via pg_sleep), starving the connection pool / max_connections
# limit for everything else. Kill the background psql processes to release
# them — heal.sh does this for you.
set -e
count="${1:-25}"
echo "[chaos] opening $count idle connections to postgres, holding 120s each..."
for i in $(seq 1 "$count"); do
  PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -c "SELECT pg_sleep(120);" >/dev/null 2>&1 &
done
echo "[chaos] $count connections held. They release automatically after 120s, or run heal.sh to kill them now."
