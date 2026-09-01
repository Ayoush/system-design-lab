# Database Bottleneck Decision Tree

Don't add infrastructure until you know which resource is actually
saturated. Check in this order:

```
Database slow?
      ↓
What is saturated?
      ├── CPU        → query plan, missing index, expensive aggregation
      ├── Disk I/O    → shared_buffers too small, working set > RAM, seq scans
      ├── Locks       → row/table contention, long transactions holding locks
      └── Connections → pool exhausted, max_connections too low, connection leak
```

Then investigate the workload shape:

```
Read-heavy (>80% reads)?
      → read replicas, caching

Write-heavy?
      → query optimization, partitioning, workload redesign (NOT just "add a replica" — replicas don't help writes)

Too much data (table/index bigger than shared_buffers)?
      → partitioning, archiving old data

Slow specific queries?
      → EXPLAIN ANALYZE, add the right index, rewrite the query

Too many connections?
      → connection pooling (pgbouncer), NOT just raising max_connections
```

## How to check each one

| Suspect | Command |
|---|---|
| CPU / query cost | `EXPLAIN (ANALYZE, BUFFERS) <query>` |
| Locks | `SELECT * FROM pg_locks WHERE NOT granted;` |
| Connections | `SELECT count(*) FROM pg_stat_activity;` vs `max_connections` |
| Slow queries | `pg_stat_statements` — `SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;` |
| Replication lag | `SELECT * FROM pg_stat_replication;` (on primary) |
| Cache hit ratio | `SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) FROM pg_statio_user_tables;` |

None of these are universal fixes. The number you look at first is the one
that tells you which branch of the tree you're in.
