#!/bin/bash
# Seeds one product with a FIXED id, so load profiles and manual curls can
# reference it reliably without parsing output every run.
set -e
PRODUCT_ID="00000000-0000-0000-0000-000000000042"
INVENTORY="${1:-100}"

PGPASSWORD=lab psql -h localhost -p 5432 -U lab -d lab -v ON_ERROR_STOP=1 <<SQL
INSERT INTO products (id, name, price_cents, inventory, sale_starts_at, sale_ends_at)
VALUES ('$PRODUCT_ID', 'Flash Sale Widget', 4999, $INVENTORY, now(), now() + interval '1 hour')
ON CONFLICT (id) DO UPDATE SET inventory = EXCLUDED.inventory;
SQL

echo "seeded product $PRODUCT_ID with inventory=$INVENTORY"
