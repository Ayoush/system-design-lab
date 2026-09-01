#!/bin/bash
# Runs ONCE, automatically, the first time the postgres container initializes
# its data directory (Postgres's own docker-entrypoint-initdb.d convention —
# any .sh/.sql file dropped there gets executed exactly once, at first boot).
#
# Purpose: make this primary ABLE to accept a streaming replica, even if no
# replica exists yet. Two things needed for that:
#   1. a database role with REPLICATION privilege
#   2. a pg_hba.conf line allowing that role to connect over the network
set -e

# Create the role the replica will authenticate as.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replpass';
EOSQL

# Allow that role to connect from anywhere on our private "lab" network.
# 0.0.0.0/0 is fine here ONLY because this network is internal/local-only —
# never do this on anything internet-reachable.
echo "host replication replicator 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
