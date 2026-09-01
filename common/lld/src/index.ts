// @lab/lld — your hand-written LLD component library.
//
// This is intentionally EMPTY. Every component below is something you write
// yourself, in anger, the moment an experiment in ROADMAP.md forces it into
// existence — that act of writing it IS the LLD learning, not something the
// framework should do for you.
//
// Workflow per component:
//   1. Run the experiment that "forces" it (see table below).
//   2. Watch it fail / measure the bad behavior.
//   3. Write the component here, as its own file, e.g. src/connection-pool.ts
//   4. Export it from this file.
//   5. Import it from your system's app code: import { ConnectionPool } from '@lab/lld'
//   6. Re-run the experiment, prove the fix, write the ADR.
//
// Planned components (from ROADMAP.md §7) — uncomment the export line as
// you build each one:

// export { ConnectionPool }      from './connection-pool';      // acquire/release, wait queue        — forced by EXP-007
// export { RetryPolicy }         from './retry-policy';         // attempts, jitter, retry budget      — forced by EXP-018
// export { CircuitBreaker }      from './circuit-breaker';      // closed/open/half-open               — forced by EXP-013, 019
// export { TokenBucket }         from './token-bucket';         // rate limiting                        — forced by EXP-017
// export { SlidingWindow }       from './sliding-window';       // rate limiting, alt algorithm         — forced by EXP-017
// export { Cache }               from './cache';                // cache-aside, TTL jitter               — forced by EXP-010
// export { Singleflight }        from './singleflight';         // dedupe concurrent identical misses   — forced by EXP-013
// export { IdempotencyStore }    from './idempotency-store';    // dedupe duplicate requests            — forced by EXP-020, 024
// export { ReadWriteRouter }     from './read-write-router';    // route by op, lag-aware               — forced by EXP-008, 009
// export { PriorityQueue }       from './priority-queue';       // heap + aging, no starvation          — forced by EXP-022, 026
// export { JobQueue }            from './job-queue';            // enqueue/lease/ack/nack → DLQ         — forced by EXP-015, 018, 021
// export { ConsistentHashRing }  from './consistent-hash-ring'; // partitioning, minimal reshuffle      — forced by EXP-026, 030
// export { InventoryReservation } from './inventory-reservation'; // hold/confirm/release state machine — forced by EXP-025, 029
// export { Outbox }              from './outbox';               // transactional outbox + relay         — forced by EXP-029, 031
// export { Bulkhead }            from './bulkhead';             // per-dependency concurrency isolation — forced by EXP-019, 023
// export { HealthCheck }         from './health-check';         // liveness vs readiness, drain          — forced by EXP-005, 027

export {};
