-- 001_init.sql — v0 schema. Deliberately minimal.
--
-- NOT included on purpose, added only when an experiment forces it:
--   orders.idempotency_key   — added when EXP-020/024 reproduces duplicate orders
--   reservations table       — added at v5 (inventory redesign)
--   outbox table              — added at v6 (Redpanda)
--
-- NOT included on purpose, bug #2 from docs/hld/v0.md:
--   no index on orders.product_id — EXP-004 proves the sequential scan first.

CREATE TABLE products (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    price_cents     integer NOT NULL CHECK (price_cents >= 0),
    inventory       integer NOT NULL,
    sale_starts_at  timestamptz NOT NULL,
    sale_ends_at    timestamptz NOT NULL,
    version         integer NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL,
    product_id      uuid NOT NULL REFERENCES products(id),
    qty             integer NOT NULL CHECK (qty > 0),
    price_cents     integer NOT NULL CHECK (price_cents >= 0),
    status          text NOT NULL DEFAULT 'pending',
    created_at      timestamptz NOT NULL DEFAULT now()
);
