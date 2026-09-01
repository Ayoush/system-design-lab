// routes/orders.ts — the naive checkout flow. Every bug listed in
// docs/hld/v0.md lives in this one file, on purpose. Read the comments
// inline; each one names which bug it is and which experiment proves it.
import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';

export const ordersRouter = Router();

const DEP_SIM_URL = process.env.DEP_SIM_URL || 'http://dep-sim:4000';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST /orders — body: { userId, productId, qty }
//
// v0 bug #4: every step below runs INLINE, sequentially, blocking the
// client's response on all of it — validate, charge, email, analytics,
// THEN respond. Nothing here is async/queued yet. EXP-018 proves this.
ordersRouter.post('/', asyncHandler(async (req, res) => {
  const { userId, productId, qty } = req.body;

  // --- 1. validate inventory (the READ half of the race) ---------------
  const { rows: productRows } = await pool.query(
    'SELECT inventory FROM products WHERE id = $1',
    [productId]
  );
  if (productRows.length === 0) return res.status(404).json({ error: 'product not found' });
  if (productRows[0].inventory < qty) return res.status(400).json({ error: 'insufficient inventory' });

  // v0 bug #6: no idempotency key anywhere. A retried/duplicated request
  // creates a second order for the same intent, with no protection.
  // EXP-020/024 prove this — don't add a dedupe check here yet.
  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (user_id, product_id, qty, price_cents, status)
     VALUES ($1, $2, $3, 0, 'pending') RETURNING *`,
    [userId, productId, qty]
  );
  const order = orderRows[0];

  // --- 2. charge — call the payment dependency --------------------------
  // v0 bug #5: no timeout on this call. If dep-sim hangs, this request
  // hangs with it, indefinitely. EXP-023 (retry storm) and the dep-latency
  // fault (common/chaos/faults/dep-fail.sh) both exercise this directly.
  let chargeOk = true;
  try {
    const chargeRes = await fetch(`${DEP_SIM_URL}/call`);
    chargeOk = chargeRes.ok;
  } catch {
    chargeOk = false;
  }

  if (!chargeOk) {
    await pool.query("UPDATE orders SET status = 'failed' WHERE id = $1", [order.id]);
    return res.status(402).json({ error: 'payment failed', orderId: order.id });
  }

  // --- 3. send email, record analytics — simulated inline work ----------
  // Neither of these needs to block the response. They do here, on
  // purpose — v0 bug #4 again. This is exactly what EXP-018/019 (moving
  // this to a queue + workers) fixes.
  await sleep(80 + Math.random() * 60);   // "sending" an email
  await sleep(20 + Math.random() * 30);   // "recording" analytics

  // --- 4. decrement inventory (the WRITE half of the race) --------------
  // v0 bug #1: this UPDATE has no "WHERE inventory >= $qty" guard, and
  // it's not wrapped in a transaction with the read in step 1. Two
  // concurrent requests can both pass the check above before either one
  // reaches this line — inventory goes negative. EXP-003 proves this.
  await pool.query('UPDATE products SET inventory = inventory - $1 WHERE id = $2', [qty, productId]);
  await pool.query("UPDATE orders SET status = 'paid' WHERE id = $1", [order.id]);

  res.status(201).json({ ...order, status: 'paid' });
}));

// GET /orders/:id
ordersRouter.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));
