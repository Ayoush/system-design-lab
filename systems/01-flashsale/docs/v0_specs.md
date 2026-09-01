# FlashSale v0 — Technical Spec

Companion to `hld/v0.md` (the architecture/why). This is the implementation
detail — exact endpoints, request/response shapes, env vars, and the fixed
test data convention. If `hld/v0.md` says "what and why," this says
"exactly how, so anyone can run it without guessing."

## Stack

- Node 20 + TypeScript, Express, raw `pg` (no ORM)
- Build: `tsc` → `dist/`, multi-stage Dockerfile
- Port 3000 inside the container, published as `8080` on the host (lab-wide convention)

## Endpoints

### `GET /products/:id`
200 → full product row. 404 if not found.

### `GET /products/:id/orders`
200 → every order row for that product, **unbounded** (v0 bug #2/#3 — no
pagination, no index on `product_id`). Deliberately returns everything.

### `POST /orders`
Body:
```json
{ "userId": "<uuid>", "productId": "<uuid>", "qty": 1 }
```
- 404 — product not found
- 400 — `qty` exceeds inventory **at the moment of the initial read** (not
  a guarantee — see below)
- 402 — dep-sim charge failed (order row persists with `status: 'failed'`)
- 201 → the order, `status: 'paid'`

**Concurrency note (the actual bug):** the inventory check (read) and the
inventory decrement (write) are separated by a charge call + two simulated
delays — a wide window. Two concurrent requests can both pass the 400
check before either decrements. This is intentional; see `hld/v0.md` bug
#1 and `../ROADMAP.md` EXP-003.

### `GET /orders/:id`
200 → order row. 404 if not found.

### `GET /healthz`
Always 200 if the process is up. Does not check the database.

### `GET /readyz`
200 if `SELECT 1` succeeds against Postgres, 503 otherwise.

### `GET /metrics`
Prometheus text exposition (via `prom-client`) — default Node process
metrics + `http_request_duration_ms` histogram, labeled by
method/route/status. Scraped automatically once `v0.yml` is up (see
`infra/prometheus-scrape.yml`).

## Environment variables

| Var | Value at v0 | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://lab:lab@postgres:5432/lab` | direct to primary — no pooler yet |
| `DEP_SIM_URL` | `http://dep-sim:4000` | fake payment dependency |
| `PORT` | `3000` (default) | |

## Test data convention

One product, fixed id, so every load profile and manual curl can reference
it without re-querying:

```
product id: 00000000-0000-0000-0000-000000000042
```

Seed it:
```bash
./lab seed 01-flashsale             # inventory defaults to 100
./lab seed 01-flashsale 10          # or pass a specific starting inventory
```

## Running it yourself

See `v0_TEST.md` — setup, smoke test, and how to reproduce the oversell
bug live, step by step.
