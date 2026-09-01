// db.ts — raw pg, no ORM. Deliberately untuned (v0 bug #7 from docs/hld/v0.md):
// no explicit max/min pool size, no acquire timeout. Uses whatever pg's
// own defaults are (max: 10). This is what EXP-007 will prove is too
// small under real concurrency — that's the point, don't fix it here.
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
