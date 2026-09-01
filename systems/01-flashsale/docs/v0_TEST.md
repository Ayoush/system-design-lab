# FlashSale v0 — Run It Yourself

Everything here is copy-paste runnable. Requires the framework already set
up — see the repo root `README.md` for prerequisites (`./lab setup`
checks them).

## 1. Bring it up, clean

```bash
cd system-design-lab
./lab up 01-flashsale v0
PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab \
  -f systems/01-flashsale/infra/migrations/001_init.sql
./lab seed 01-flashsale        # inventory = 100
```

To reset back to zero at any point (fresh volumes, tables recreated, empty
orders table):
```bash
docker compose --project-directory . \
  -f common/infra/base.yml -f common/infra/observability.yml \
  -f common/infra/postgres.yml -f common/infra/dep-sim.yml \
  -f systems/01-flashsale/infra/v0.yml down -v
./lab up 01-flashsale v0
PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab \
  -f systems/01-flashsale/infra/migrations/001_init.sql
./lab seed 01-flashsale 10
```

## 2. Smoke test every endpoint

```bash
curl http://localhost:8080/products/00000000-0000-0000-0000-000000000042

curl -X POST http://localhost:8080/orders \
  -H 'Content-Type: application/json' \
  -d '{"userId":"11111111-1111-1111-1111-111111111111","productId":"00000000-0000-0000-0000-000000000042","qty":1}'

curl http://localhost:8080/products/00000000-0000-0000-0000-000000000042/orders
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
curl http://localhost:8080/metrics
```

## 3. Reproduce the oversell bug (EXP-003)

```bash
./lab seed 01-flashsale 10          # small inventory — easy to oversell
./lab load 01-flashsale flash-sale \
  -e PRODUCT_ID=00000000-0000-0000-0000-000000000042 -e SALE_RATE=100

PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -c \
  "SELECT inventory FROM products WHERE id='00000000-0000-0000-0000-000000000042';"
PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -c \
  "SELECT status, count(*) FROM orders WHERE product_id='00000000-0000-0000-0000-000000000042' GROUP BY status;"
```

Expect `inventory` negative, and `paid` order count exceeding the starting
stock.

**Confirmed, live, on real infra:** seeded inventory=10, ran the flash-sale
profile at `SALE_RATE=100` for 30s → final `inventory = -17`, 28 orders
`status='paid'`.

## 4. Same thing, recorded as a real experiment

This is the version that leaves a paper trail — `lab exp start`/`lab exp
end` don't generate any traffic themselves, they just bookend whatever you
run in between and pull real Prometheus numbers into the file at the end.

```bash
./lab exp start naive-baseline-live-demo
#  ^ open systems/01-flashsale/experiments/EXP-00N-*.md, fill in
#    Hypothesis + Prediction before continuing

curl http://localhost:8080/products/00000000-0000-0000-0000-000000000042
curl -X POST http://localhost:8080/orders -H 'Content-Type: application/json' \
  -d '{"userId":"11111111-1111-1111-1111-111111111111","productId":"00000000-0000-0000-0000-000000000042","qty":1}'

./lab load 01-flashsale flash-sale \
  -e PRODUCT_ID=00000000-0000-0000-0000-000000000042 -e SALE_RATE=100

PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -c \
  "SELECT inventory FROM products WHERE id='00000000-0000-0000-0000-000000000042';"

./lab exp end
```

Optional, good on screen while the load runs: Grafana at
`http://localhost:3000` — live container CPU/memory, more visual than a
terminal.
