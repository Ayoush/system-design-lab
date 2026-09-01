// routes/products.ts
import { Router } from 'express';
import { pool } from '../db';
import { asyncHandler } from '../async-handler';

export const productsRouter = Router();

// GET /products/:id
productsRouter.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// GET /products/:id/orders
//
// v0 bug #2 + #3 (docs/hld/v0.md): no index on orders.product_id, and no
// LIMIT/pagination — returns every matching row, unbounded. EXP-004
// proves this gets slow as the orders table grows. Don't add LIMIT or an
// index here yet — that's the fix, not the starting point.
productsRouter.get('/:id/orders', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE product_id = $1', [req.params.id]);
  res.json(rows);
}));
