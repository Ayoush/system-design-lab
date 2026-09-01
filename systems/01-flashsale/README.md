# FlashSale — System 01

This is the first real system built on the framework. Everything in
`common/` is ready. This file states the problem — the actual design work
(HLD, LLD, schema, code) starts from here, by you.

Full experiment matrix and milestone plan: see `../../ROADMAP.md` §9-11.

---

## Problem statement

FlashSale is a flash-sale platform: users discover products and buy them
during a limited-inventory, limited-time sale window.

A flash sale has: a product, a price, limited inventory, a start/end time,
and a large number of interested users trying to buy at once when it opens.

## Requirements

1. Serve product/catalog reads quickly.
2. Handle normal browsing traffic.
3. Survive a sudden spike when a sale opens.
4. **Never oversell inventory** — this is the one invariant, see `slo.md`.
5. Process orders reliably, including under partial failure.
6. Handle payment-dependency failures without corrupting order state.
7. Remain available when individual components fail.
8. Scale from near-zero traffic to a traffic spike, cleanly.

## Schema (raw SQL, no ORM — ORM hides pool behavior and query plans)

```
products(id, name, price_cents, inventory, sale_starts_at, sale_ends_at, version, updated_at)
orders(id, user_id, product_id, qty, price_cents, status, created_at)
```

Deferred until an experiment forces them — don't build these early:

```
orders.idempotency_key UNIQUE                                       -- added when EXP-020/024 reproduces duplicate orders
reservations(id, product_id, user_id, qty, state, expires_at)       -- added at v5
outbox(id, aggregate_id, event_type, payload, published_at)         -- added at v6
```

## API (v0 — extend as later versions need more)

```
GET  /products/:id
GET  /products/:id/orders
POST /orders
GET  /orders/:id
GET  /healthz  /readyz  /metrics
```

## SLO (set at v1, defended from there on)

```
checkout p99   < 300ms
error rate     < 0.5%
invariant      oversell == 0, always, under any concurrency
```

---

## Deliberate v0 bugs (plant these on purpose, then discover them one by one)

1. Read-check-write on inventory → the oversell race
2. No index on `orders.product_id` → sequential scan under load
3. `GET /products/:id/orders` returns everything, unpaginated
4. Fully synchronous checkout: validate → order → charge → email → analytics → respond
5. No timeouts on any outbound call
6. No idempotency key enforcement
7. Default, untuned connection pool
8. No cache, no queue, no retry, no breaker

## Version ladder

| v | Adds |
|---|---|
| v0 | naive: 1 API, 1 Postgres, all 8 bugs above, live |
| v1 | LB, 3 API replicas, hand-written `ConnectionPool`, health checks |
| v2 | read replica, `ReadWriteRouter` |
| v3 | Redis, cache-aside, `Singleflight`, `CircuitBreaker` |
| v4 | queue + workers, `RetryPolicy`, `IdempotencyStore`, DLQ, `PriorityQueue` |
| v5 | inventory redesign: atomic update, `InventoryReservation`, partitioning |
| v6 | Redpanda, `Outbox`, consumer groups |
| v7 | chaos + blind FDE drills |

Full experiment-by-experiment breakdown (EXP-001 through EXP-042): `../../ROADMAP.md` §10.

---

## Workflow — v0, step by step

### 1. Write the app

**Where:** `src/` (this folder). **Language:** Node + TS. **DB access:** raw
`pg`, no ORM — ORM hides pool/query-plan behavior you're here to see.

```
src/
├── package.json        deps: express (or plain http), pg, typescript
├── tsconfig.json
├── Dockerfile           same pattern as ../../common/services/dep-sim/Dockerfile
├── db.ts                 raw pg.Pool
├── routes/{products,orders}.ts
└── server.ts
```

DB connection via env var, standard 12-factor:
```
DATABASE_URL=postgres://lab:lab@postgres:5432/lab
```
`postgres` resolves by service name — same mechanism already proven working
with pgbouncer/redis on the `lab` network.

### 2. Schema

Raw SQL at `infra/migrations/001_init.sql` (table shapes above). Run it
with `psql` once `postgres` is up, or write `scripts/migrate.sh`.

### 3. Wire infra

`infra/v0.yml`:
```yaml
services:
  api:
    build:
      context: ./systems/01-flashsale/src
    ports:
      - "8080:3000"
    environment:
      DATABASE_URL: postgres://lab:lab@postgres:5432/lab
    networks: [lab]
    depends_on:
      postgres:
        condition: service_healthy
```

`infra/v0.stack`:
```
common/infra/base.yml
common/infra/observability.yml
common/infra/postgres.yml
systems/01-flashsale/infra/v0.yml
```

### 4. Run it

```bash
cd ../..
./lab up 01-flashsale v0
curl http://localhost:8080/products/42
```

### 5. Check inventory truth directly (bypass the app)

```bash
PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -c "SELECT id, inventory FROM products WHERE id='42';"
```
This is how you prove the oversell bug — hit `/orders` concurrently, then
check this query for negative inventory.

### 6. Load test

```bash
./lab load 01-flashsale flash-sale -e PRODUCT_ID=42 -e SALE_RATE=500
```
Uses `../../common/load/profiles/flash-sale.js` unless you drop a
system-specific override at `load/flash-sale.js` — `lab load` checks this
system's folder first, falls back to `common/`.

### 7. Record the baseline report

```bash
./lab exp start naive-baseline
# fill Hypothesis + Prediction in the file it just created, THEN:
./lab load 01-flashsale steady -e RATE=50 -e DURATION=30s
./lab exp end
```
Writes `experiments/EXP-001-naive-baseline.md`, auto-pulls Prometheus
numbers in. This file **is** the naive-v0 report. Every later version gets
its own numbered experiment; `./lab exp diff EXP-001 EXP-005` compares any two.

### 8. Evolve — v1 onward

| Add | Mechanism |
|---|---|
| LB + replicas | `common/infra/nginx.yml` merged with your own `infra/nginx.conf` (Compose merges same-service volumes across files) + `deploy.replicas` or named api services |
| Read replicas | `common/infra/postgres-replica.yml` — already built, real streaming replication — one line in `v2.stack` |
| Cache | `common/infra/redis.yml` — one line in `v3.stack` |
| Queue/workers | `common/infra/redpanda.yml` + hand-write `JobQueue` in `../../common/lld/src/` |
| Partitioning/sharding | **LLD, not infra** — write `ConsistentHashRing` in `../../common/lld/src/`, import into your routing. No new compose fragment |

Each version = new `vN.stack` + `vN.yml` (only what's system-specific) +
new `docs/hld/vN.md` (template: `../../common/templates/hld.md`) + new
experiments proving the change. `../../common/playbooks/db-bottleneck.md`
and `capacity-math.md` are the reference while diagnosing which of these
to reach for. Full experiment-by-experiment map: `../../ROADMAP.md` §10.

Start with `docs/hld/v0.md`, then the schema, then the app — bugs
included, on purpose. Don't touch `@lab/lld` until an experiment forces
the first component.
