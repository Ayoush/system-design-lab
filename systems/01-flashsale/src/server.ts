// server.ts — wires everything together. No cache, no queue, no retry
// policy, no circuit breaker anywhere in this file (v0 bug #8) — every
// request pays the full cost of every dependency, every time.
import express from 'express';
import client from 'prom-client';
import { pool } from './db';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';

const app = express();
app.use(express.json());

// --- metrics -----------------------------------------------------------
client.collectDefaultMetrics();
const httpDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'request duration in ms',
  labelNames: ['method', 'route', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    httpDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode },
      Date.now() - start
    );
  });
  next();
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

// --- health --------------------------------------------------------------
app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));

app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// --- routes --------------------------------------------------------------
app.use('/products', productsRouter);
app.use('/orders', ordersRouter);

// Baseline safety net — NOT one of the 8 deliberate v0 bugs. An async
// Express 4 route handler that throws produces an unhandled promise
// rejection; with no catch anywhere, that CRASHES the whole process, not
// just that one request. That's not an interesting scaling lesson, it's
// just an unreliable server that makes every experiment flaky. This
// middleware is the one exception to "v0 has no error handling" — it
// exists so the process survives a bad request instead of dying.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`flashsale-api (v0) listening on :${PORT}`));
