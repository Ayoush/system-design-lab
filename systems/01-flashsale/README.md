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
orders(id, user_id, product_id, qty, price_cents, status, idempotency_key UNIQUE, created_at)
reservations(id, product_id, user_id, qty, state, expires_at)      -- added at v5
outbox(id, aggregate_id, event_type, payload, published_at)        -- added at v6
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

## Getting started

```bash
cd ../..
./lab up 01-flashsale v0        # once you've written infra/v0.yml and v0.stack
```

Start with `docs/hld/v0.md` (use `../../common/templates/hld.md`), then the
schema migration, then the app. Write the naive version — bugs included —
before touching anything in `@lab/lld`.
