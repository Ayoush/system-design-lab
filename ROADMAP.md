# System Design Lab — Framework + FlashSale (System 01)

> **Plan only. No implementation.** You write all the code.
> **Storage note:** plan-mode restricts me to this file. First execution step copies it to
> `~/Desktop/SYSTEM_DESIGN_LAB_PLAN.md` and `~/Documents/system-design-lab/ROADMAP.md`.

---

## 1. Context

**Goal:** learn HLD **and** LLD by hand, across ~500 system designs, by building deliberately naive systems, breaking them under measured load, diagnosing the bottleneck, and introducing one component at a time.

**Problem this solves:** you can't generate 1M real requests on a laptop. You don't need to.

- To break a system you need utilization `ρ = λ/μ > 1`.
- Two levers: raise `λ` (load) or lower `μ` (capacity).
- **Shrink capacity, not raise load.** Postgres at `max_connections=20` + API at `--cpus=0.25` dies at ~200 RPS. Same physics, same graphs, same lessons, laptop-sized.
- Little's Law: `L = λW`. 10k RPS at 100ms = 1,000 concurrent, not 1M. Concurrency is what costs RAM, not request count.

**Second problem this solves:** one framework serving 500 designs. Every system design is the same 7 primitives wired differently — `CLIENT, BOX, LINK, STORE, ROUTER, QUEUE, FAULT`. Build them once in `common/`. Each new system is a wiring config + domain code, not a new framework.

**Decisions locked:**

| | |
|---|---|
| App tier | **Node 24 + TypeScript**, raw SQL via `pg` (no ORM — ORM hides pool + query plan) |
| Scope of system 01 | **Full** — v0 naive through Kafka/streaming, chaos, and FDE drills |
| Track | **Metal only** (real Docker containers, shrunk). Simulator track deferred — it's a phase-2 luxury |
| Broker | **Redpanda**, not Kafka. Kafka API compatible, single binary, no ZooKeeper, ~1 GB vs ~3 GB |

**Prior art being superseded:** `~/Desktop/FDE_System_Design_Sandbox_Implementation_Plan_FINAL.md` — good vision doc but Ubuntu-targeted and not buildable. This plan keeps its FDE model, incident taxonomy, and scorecard, and makes them executable on macOS.

---

## 2. Machine setup (M0)

Verified on your machine: 10 cores, 16 GB RAM, macOS 26.6. Node 24.14, pnpm, Python 3.13, Elixir, jq all present.

**Blocker: Docker CLI is installed but no daemon is running.**

| Install | Why |
|---|---|
| **OrbStack** (`brew install orbstack`) | Recommended over Docker Desktop. Far lower VM overhead on Mac — matters because VM noise pollutes every latency measurement |
| `brew install k6` | Load generator. **Must** support open-loop |
| `brew install libpq` + link `psql` | DB inspection, `EXPLAIN ANALYZE` |
| `brew install redis` (client only) | `redis-cli` for cache inspection |

**VM sizing:** give the Docker VM **6 CPUs / 8 GB**. Leaves 4 cores for k6 + your editor. Load generator starving is the #1 cause of fake results.

**Mac gotchas to write into `common/playbooks/measurement-honesty.md`:**

1. Postgres data in a **named volume**, never a bind mount. macOS bind-mount I/O is terrible and will destroy every disk measurement.
2. **Thermal throttling** — run each experiment twice, discard the first. Record ambient state.
3. `tc netem` is unavailable on the macOS host. Use **toxiproxy** for all network faults (works everywhere, per-dependency, HTTP-controlled). Only reach for `tc` inside a Linux container with `NET_ADMIN` if toxiproxy can't express the fault.
4. Run k6 **on the host**, not in a container — otherwise the generator competes with the system under test for the same VM CPU.

---

## 3. Folder structure

```
~/Documents/system-design-lab/
├── README.md                  # what this is, how to run anything
├── ROADMAP.md                 # copy of this plan
├── lab                        # CLI entrypoint (bash)
├── pnpm-workspace.yaml        # ← makes common/ importable by every system
├── package.json
│
├── common/                    # ══ THE FRAMEWORK. Reused by all 500 systems. ══
│   ├── README.md
│   ├── infra/                 # composable docker-compose fragments
│   │   ├── base.yml           # network, prometheus scrape targets
│   │   ├── postgres.yml
│   │   ├── postgres-replica.yml
│   │   ├── pgbouncer.yml
│   │   ├── redis.yml
│   │   ├── redpanda.yml
│   │   ├── nginx.yml          # load balancer
│   │   ├── toxiproxy.yml
│   │   ├── observability.yml  # prometheus, grafana, cadvisor, exporters, tempo
│   │   └── profiles/          # ← THE SHRINK DIAL
│   │       ├── nano.env
│   │       ├── tiny.env
│   │       └── small.env
│   ├── services/
│   │   └── dep-sim/           # fake external dependency (payment/email/sms)
│   ├── load/                  # k6 library
│   │   ├── lib/               # open-loop executors, zipf popularity, mixes
│   │   └── profiles/          # steady, ramp, spike, flash-sale, hot-key, soak
│   ├── chaos/
│   │   ├── faults/            # one file per fault, declarative
│   │   └── driver.ts          # toxiproxy + docker driver
│   ├── lld/                   # ══ YOUR HAND-WRITTEN COMPONENT LIBRARY ══
│   │   └── src/               # @lab/lld — imported by every system
│   ├── observability/
│   │   ├── prometheus/
│   │   ├── grafana/dashboards/
│   │   └── otel/
│   ├── playbooks/             # diagnostic frameworks
│   └── templates/             # scaffolds: new system, experiment, ADR, HLD, LLD
│
└── systems/
    ├── 00-TEMPLATE/
    └── 01-flashsale/
        ├── README.md          # problem statement, requirements, SLO
        ├── docs/
        │   ├── hld/           # v0.md … v7.md — architecture per version
        │   ├── lld/           # class + interface designs
        │   └── adr/           # ADR-001… decision records
        ├── src/               # app code
        ├── infra/             # compose overlays: v0.yml … v7.yml
        ├── load/              # system-specific k6 scenarios
        ├── experiments/       # EXP-001.md … numbered logs
        └── results/           # raw metrics JSON + exported graphs
```

**Do not put the lab inside `~/Documents/SysRep`** — that is an existing unrelated TS monorepo with its own git history.

---

## 4. How `common/` actually serves 500 systems

Three concrete mechanisms. Not aspiration — each works on day one.

### 4.1 Compose fragment layering

Docker Compose merges `-f` files left to right. "Add a cache" = include one more file.

```bash
docker compose \
  --env-file common/infra/profiles/nano.env \
  -f common/infra/base.yml \
  -f common/infra/postgres.yml \
  -f common/infra/redis.yml \
  -f common/infra/observability.yml \
  -f systems/01-flashsale/infra/v3.yml \
  up -d
```

Every "component" in system design maps to one fragment:

| HLD says "add" | Fragment / mechanism |
|---|---|
| Load balancer | `nginx.yml` |
| Horizontal scaling | `deploy.replicas` in the system overlay |
| Read replicas | `postgres-replica.yml` + `ReadWriteRouter` (LLD) |
| Connection pooler | `pgbouncer.yml` |
| Cache | `redis.yml` + `Cache` (LLD) |
| Queue / streaming | `redpanda.yml` |
| External dependency | `services/dep-sim` |
| Network fault | `toxiproxy.yml` |
| Sharding / partitioning | `ConsistentHashRing` (LLD) — routing, not infra |
| Retry, breaker, rate limit | LLD components — policy, not infra |

### 4.2 Resource profiles — the difficulty slider

Same topology, different `.env`. This is how you break things on a laptop.

| Profile | api cpus/mem | pg cpus/mem | `max_connections` | app pool | redis maxmem | breaks around |
|---|---|---|---|---|---|---|
| **nano** (default) | 0.25 / 256m | 0.5 / 256m | 20 | 5 | 8mb | ~150 RPS |
| **tiny** | 0.5 / 512m | 1.0 / 512m | 50 | 10 | 32mb | ~500 RPS |
| **small** | 1.0 / 1g | 2.0 / 1g | 100 | 20 | 128mb | ~1500 RPS |

Also pin `shared_buffers=8MB` and `work_mem=64kB` on nano — forces disk reads and spill-to-disk sorts, making I/O curves visible immediately.

Default to **nano**. Fast iteration, laptop stays usable, failures arrive in seconds.

### 4.3 pnpm workspace — LLD components as a real package

```yaml
# pnpm-workspace.yaml
packages: ['common/lld', 'common/services/*', 'systems/*']
```

`common/lld` publishes as `@lab/lld`. Every system imports the same hand-written `RetryPolicy`, `CircuitBreaker`, `IdempotencyStore`. You write each one **once**, in anger, because an experiment forced it — then reuse forever.

That is the framework. Everything else is domain code.

---

## 5. The `lab` CLI

Bash wrapper over compose + k6 + chaos. Thin on purpose.

```
lab setup                              verify docker/k6/psql, pull images
lab new <name>                         scaffold systems/NN-<name>/ from template

lab up <system> <version> [--profile nano]
lab down <system>
lab reset <system>                     wipe volumes, reseed dataset
lab seed <system> [--products N --orders N]

lab load <system> <profile> [--rate N --duration 120s]
lab break <fault> [args...]            e.g. lab break db-latency --ms 800
lab heal                               remove all active faults

lab exp start <slug>                   create EXP-NNN.md, snapshot config, mark t0
lab exp end                            query prometheus t0→t1, write results, export graphs
lab exp diff <A> <B>                   before/after table
```

**`lab exp start` is the learning engine.** It refuses to proceed until the `## Prediction` section of the experiment file is non-empty. You commit to a prediction *before* running. Wrong predictions are the whole point — they're where the learning actually lives.

---

## 6. Observability (build in M1, before any load test)

Non-negotiable prerequisite. Never inject a fault into a system you can't see.

| Layer | Tool | Key signals |
|---|---|---|
| Metrics | Prometheus + Grafana | golden signals: latency, traffic, errors, saturation |
| App | `prom-client` | RPS, p50/p95/p99 histograms, status codes, **pool wait time**, cache hit ratio, retry count, queue depth |
| Containers | cAdvisor | CPU, memory, throttled seconds |
| Postgres | `postgres_exporter` | connections, `pg_stat_statements`, lock waits, replication lag, buffer hit ratio |
| Redis | `redis_exporter` | hit rate, evictions, memory, per-key hotness |
| Redpanda | native `/metrics` | consumer lag, partition throughput, rebalance count |
| Traces | OpenTelemetry → Tempo | `client → LB → API → cache → pool → DB → queue → worker → dep` |

**Dashboards to build:** Platform Overview, Service Health, Postgres, Cache, Queue/Kafka, Load Test, Incident Timeline.

Use **native histograms / proper quantile buckets** — never average latency. Averages hide every failure you're trying to see.

---

## 7. LLD catalog — what you hand-write

This is the LLD curriculum. Real infra (Postgres, Redis, Redpanda, nginx) stays real. You hand-write the **policy and application** layer — that's where the design skill lives.

Each entry ships with: interface, invariants, unit tests, and the experiment that forced it into existence.

| # | Component | Core interface (shape only — you implement) | Forced by |
|---|---|---|---|
| 1 | `ConnectionPool` | `acquire(timeoutMs) → Conn`, `release(c)`, wait queue, metrics on wait time | EXP-007 |
| 2 | `RetryPolicy` | attempts, base/max delay, **full vs decorrelated jitter**, retry budget, `isRetryable(err)` | EXP-018 |
| 3 | `CircuitBreaker` | closed/open/half-open, failure threshold, reset timeout, half-open probe limit | EXP-013, 019 |
| 4 | `TokenBucket` + `SlidingWindow` | `tryConsume(n) → bool`, refill rate, burst capacity | EXP-017 |
| 5 | `Cache` + `RedisCache` + `LruL1` | `get/set/del`, TTL **with jitter**, negative caching | EXP-010 |
| 6 | `Singleflight` | `do(key, fn)` — dedupe concurrent identical misses | EXP-011 |
| 7 | `IdempotencyStore` | `begin(key) → {fresh|inflight|done(result)}`, race-safe insert, TTL | EXP-020 |
| 8 | `ReadWriteRouter` | route by op; lag-aware; **read-your-writes** pinning | EXP-008, 009 |
| 9 | `PriorityQueue` | binary heap + **aging** to prevent starvation | EXP-022 |
| 10 | `JobQueue` | `enqueue / lease(visibilityTimeout) / ack / nack → DLQ` | EXP-015, 018, 021 |
| 11 | `ConsistentHashRing` | virtual nodes, `addNode/removeNode`, minimal reshuffle | EXP-026, 030 |
| 12 | `InventoryReservation` | state machine `held → confirmed | released | expired` + sweeper | EXP-025 |
| 13 | `Outbox` | transactional outbox table + relay poller | EXP-029 |
| 14 | `Bulkhead` | semaphore-isolated concurrency per dependency | EXP-019 |
| 15 | `HealthCheck` | **liveness vs readiness** distinction, drain on shutdown | EXP-005, 027 |

---

## 8. Playbooks (`common/playbooks/`)

Reference material you write once and consult for all 500 systems.

| File | Contents |
|---|---|
| `diagnose.md` | OBSERVE → LOCATE → HYPOTHESIZE → EXPERIMENT → MITIGATE → VERIFY → BREAK AGAIN |
| `db-bottleneck.md` | Decision tree: CPU / IO / locks / connections → what each implies |
| `capacity-math.md` | Little's Law `L=λW`; M/M/1 knee `R=S/(1−ρ)`; USL `C(N)=N/(1+α(N−1)+βN(N−1))` |
| `measurement-honesty.md` | Open vs closed loop, **coordinated omission**, warmup, repeat runs, Mac thermals |
| `failure-taxonomy.md` | CAPACITY / CONSISTENCY / DEPENDENCY / NETWORK / CONFIG / DEPLOY / STATE / DATA / BACKPRESSURE / HUMAN |
| `slo.md` | Setting SLOs and error budgets per system |
| `fde-rules.md` | Start with symptoms; find the budget-burning hop; establish blast radius; mitigate before full understanding; one change at a time; preserve evidence |

**Load-generation rule, stated once, applied always:** use `k6` `constant-arrival-rate` (open-loop). Never a naive loop or default `wrk`. Closed-loop generators slow down when the server slows, hiding the failure — **coordinated omission**. Your P99 graph will lie to you.

---

## 9. FlashSale — domain

**Schema (raw SQL migrations, no ORM):**

```
products(id, name, price_cents, inventory, sale_starts_at, sale_ends_at, version, updated_at)
orders(id, user_id, product_id, qty, price_cents, status, idempotency_key UNIQUE, created_at)
reservations(id, product_id, user_id, qty, state, expires_at)      -- from v5
outbox(id, aggregate_id, event_type, payload, published_at)        -- from v6
```

**API:**
```
GET  /products/:id
GET  /products/:id/orders     -- deliberately unindexed in v0
POST /orders
GET  /orders/:id
GET  /healthz  /readyz  /metrics
```

**SLO (set at v1, defended from there on):** `checkout p99 < 300ms`, `error rate < 0.5%`, **`oversell == 0` always**.

### Deliberate bugs planted in v0

Write these down so you can distinguish *planted* from *emergent* failures:

1. Read-check-write on inventory → **oversell race**
2. No index on `orders.product_id` → seq scan
3. `GET /products/:id/orders` returns all rows, no pagination → unbounded query
4. Synchronous checkout: validate → order → charge → email → analytics → respond
5. No timeouts on any outbound call
6. No idempotency key enforcement
7. Default `pg` pool, untuned
8. No cache, no queue, no retry, no breaker

### Version ladder

| v | Architecture | Introduced |
|---|---|---|
| **v0** | 1 API → 1 Postgres | nothing. deliberately naive |
| **v1** | nginx → 3 API → Postgres | LB, statelessness, health checks, own `ConnectionPool` |
| **v2** | + read replica | `ReadWriteRouter`, replication lag handling |
| **v3** | + Redis | cache-aside, singleflight, TTL jitter, L1, circuit breaker |
| **v4** | + queue + workers | async checkout, retry/backoff, idempotency, DLQ, priority queue, backpressure |
| **v5** | inventory redesign | atomic update, reservations, contention mitigation, partitioning |
| **v6** | + Redpanda | outbox, partitioning, consumer groups, lag, replay |
| **v7** | chaos + FDE | fault catalog, incident engine, blind drills, scorecard |

---

## 10. Experiment matrix

Every row: hypothesis → prediction (written first) → measurement → diagnosis → smallest useful fix → re-measure.

### Baseline & naive (v0)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 001 | 50 RPS steady | nothing | establish baseline | — | golden signals, open-loop, coordinated omission |
| 002 | ramp to knee | API CPU 100%, p99 cliff | utilization vs latency curve | — | **M/M/1 knee**, Little's Law |
| 003 | 20 concurrent, inventory=10 | **oversell → negative** | app logs, row history | atomic `UPDATE … WHERE inventory >= $1` | race condition, atomicity |
| 004 | list orders under load | 900ms p95 | `EXPLAIN ANALYZE`, `pg_stat_statements` | index + keyset pagination | query optimization, N+1 |

### Scale out (v1)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 005 | ramp | API saturated | cAdvisor CPU | nginx + 3 replicas + `HealthCheck` | horizontal scaling, statelessness |
| 006 | ramp higher | **DB CPU 98%, API 35%** | compare layers | — (observe only) | **bottleneck migration** |
| 007 | ramp | latency = mostly pool wait | pool wait histogram | hand-written `ConnectionPool` + acquire timeout | pool exhaustion, queueing |
| 008 | sustained | one API node hot | per-node RPS | LB algorithm: RR vs least-conn | load balancing strategy |

### Read scaling (v2)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 009 | 90/10 read/write | read CPU dominates | read/write ratio | streaming replica + `ReadWriteRouter` | read replicas |
| 010 | write → immediate read | **stale read** | `pg_stat_replication` lag | read-your-writes pinning | replication lag, consistency |
| 011 | stop the replica | reads fail or fall back | dependency health | failover + degrade to primary | replica loss |

### Caching (v3)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 012 | hot product read-heavy | DB still saturated | same key repeatedly | Redis cache-aside + `Cache` | cache hit ratio |
| 013 | expire hot key under load | **stampede** → DB spike | miss burst, DB QPS | `Singleflight` + TTL jitter | cache stampede, coalescing |
| 014 | 95% traffic → 1 key | Redis CPU / single shard | key distribution | `LruL1` in-process + short TTL | **hot key** |
| 015 | update price, read cached | **stale price** | compare DB vs cache | invalidation strategy + ADR | cache invalidation |
| 016 | kill Redis mid-load | all miss → DB cascade | dependency metrics | `CircuitBreaker` + stale-while-error | graceful degradation, miss storm |
| 017 | `maxmemory 8mb`, grow keyset | eviction storm, hit rate collapse | `redis_exporter` evictions | sizing + eviction policy choice | eviction, capacity |

### Async (v4)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 018 | checkout load | p99 = sum of all sync hops | trace waterfall | — (observe only) | synchronous coupling |
| 019 | same | — | — | `JobQueue` + workers, `POST /orders` → 202 | async processing |
| 020 | 20× burst | queue depth climbs | producer vs consumer rate | scale workers, measure drain rate | burst absorption, backlog |
| 021 | sustained overload | unbounded queue growth | oldest-message age | bounded queue + `TokenBucket` + load shedding | **backpressure** |
| 022 | kill worker mid-job | job lost or stuck | lease/ack semantics | visibility timeout + `RetryPolicy` | retry, exponential backoff + jitter |
| 023 | dep-sim fails 100% | **retry storm** amplifies | retry rate vs base rate | retry budget + `CircuitBreaker` + `Bulkhead` | retry storms, **metastable failure** |
| 024 | redeliver same job | **double charge** | duplicate delivery | `IdempotencyStore` + unique constraint | idempotency |
| 025 | inject malformed job | worker loops forever | retry count per message | DLQ + `lab dlq replay` tool | poison message, DLQ |
| 026 | mixed VIP/normal jobs | VIP starved behind bulk | per-class wait time | `PriorityQueue` + aging | priority queue, starvation |
| 027 | create then cancel, reordered | wrong final state | event order | per-order key + state machine guard | message ordering, ordering scope |

### Inventory concurrency (v5)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 028 | 1000 users, inventory=100 | lock waits, throughput collapse | `pg_locks`, lock wait time | benchmark **3 strategies**: pessimistic `FOR UPDATE` / optimistic `version` / atomic conditional `UPDATE` | concurrency control, hot row |
| 029 | flash sale spike | inventory row is the bottleneck | contention on single row | `InventoryReservation` + expiry sweeper | reservations, holds |
| 030 | same | — | — | split inventory into N buckets, `ConsistentHashRing` route | partitioning, hot-row mitigation |

### Streaming (v6, Redpanda)

| EXP | Load | What breaks | Diagnose with | Fix / build | Concept |
|---|---|---|---|---|---|
| 031 | write DB + publish event, kill between | **lost event / dual-write** | DB vs topic divergence | transactional `Outbox` + relay | dual-write problem |
| 032 | partition by wrong key | **hot partition** | per-partition throughput | partition key redesign | partitioning strategy |
| 033 | producer burst | consumer lag climbs | Redpanda lag metric | scale consumer group | consumer lag, group scaling |
| 034 | add/remove consumers under load | rebalance storm, stalls | rebalance count | static membership / cooperative rebalance | rebalancing |
| 035 | replay from offset 0 | duplicates downstream | offset management | idempotent consumers | replay, at-least-once |
| 036 | stop a broker | producer errors | broker health | acks/retries config, ISR | broker loss, durability |

### Chaos + FDE (v7)

| EXP | Fault | Question |
|---|---|---|
| 037 | kill one API instance | does traffic continue? does the LB notice? |
| 038 | 800ms DB latency (toxiproxy) | graceful degradation, or cascading timeout pileup? |
| 039 | exhaust DB connections | which layer reports it first? |
| 040 | dep-sim 5% error rate | does the breaker trip at the right threshold? |
| 041 | **composite:** traffic spike + Redis latency + one replica down | which breaks first? |
| 042 | **blind drill** — Incident Engine | symptom only, root cause hidden, timer running, scorecard at end |

**Incident Engine model** (from your FINAL doc, §24): each incident stores `symptom`, `injected_fault`, `root_cause`, `expected_metrics`, `mitigation`, `permanent_fix`, `prevention`, `time_budget`. You see only the symptom. Score on detection time, mitigation time, root-cause accuracy, unnecessary changes, regression introduced.

---

## 11. Milestones

| M | Deliverable | Est. | Done when | Status |
|---|---|---|---|---|
| **M0** | OrbStack + k6 + psql installed, VM at 6cpu/8gb; plan copied to Desktop + lab root | 0.5d | `lab setup` passes all checks | ✅ done |
| **M1** | Repo skeleton, pnpm workspace, compose fragments, 3 profiles, `lab` CLI, **full observability stack** | 2d | `lab up` brings up Grafana with live container metrics | ✅ done — plus postgres+replica, redis, pgbouncer, redpanda, nginx, toxiproxy all built and verified, ahead of schedule |
| **M2** | `dep-sim` service + k6 library (open-loop, zipf popularity, 6 profiles) + experiment/ADR templates | 1.5d | `lab load` produces a p99 graph in Grafana | ✅ done — 6 profiles built, smoke-tested. Note: hot-key.js uses a simple weighted-fraction split, not a true Zipf distribution — good enough to reproduce hot-key saturation, upgrade to real Zipf later if a specific experiment needs the finer distribution shape |
| **M3** | FlashSale v0 + seed + EXP-001…004 | 2d | oversell reproduced and logged; baseline recorded | ⬜ not started — this is the actual design work, yours |
| **M4** | v1 — LB, replicas, `ConnectionPool`, `HealthCheck` + EXP-005…008 | 2d | bottleneck migration demonstrated with before/after | ⬜ |
| **M5** | v2 — replica + `ReadWriteRouter` + EXP-009…011 | 1.5d | stale read reproduced, then fixed | ⬜ |
| **M6** | v3 — cache, `Singleflight`, `LruL1`, `CircuitBreaker` + EXP-012…017 | 2.5d | stampede reproduced and mitigated, measured | ⬜ |
| **M7** | v4 — queue, workers, `RetryPolicy`, `IdempotencyStore`, DLQ, `PriorityQueue`, `TokenBucket` + EXP-018…027 | 4d | retry storm reproduced; double-charge reproduced then eliminated | ⬜ |
| **M8** | v5 — three inventory strategies benchmarked, `InventoryReservation`, partitioning + EXP-028…030 | 2.5d | oversell = 0 under 1000-way contention, with throughput numbers for all 3 strategies | ⬜ |
| **M9** | v6 — Redpanda, `Outbox`, partitioning, consumer groups + EXP-031…036 | 3d | dual-write loss reproduced, then fixed with outbox | ⬜ (Redpanda + console infra ready, `Outbox` LLD component not written) |
| **M10** | v7 — fault catalog, chaos driver, Incident Engine, scorecard + EXP-037…042 | 3d | you can run a blind drill on yourself and score it | 🟡 partial — reusable fault library + `lab break`/`lab heal` built and verified (kill/pause/db-latency/cache-outage/dep-fail/connection-exhaust). Incident Engine (hidden root cause + timer + scorecard) is FlashSale-specific v7 content, not started |
| **M11** | **Harvest** — extract everything reusable into `common/`, write `00-TEMPLATE`, scaffold system 02 | 1.5d | `lab new url-shortener` produces a runnable v0 in under 30 min | ✅ effectively done early — `common/` was built framework-first, and `lab new` is tested working (see README pitfalls log) |

**M11 was pulled forward.** Since the framework was built before FlashSale
instead of after, "extract what's reusable" wasn't needed — everything in
`common/` was written reusable from the start. What remains from the
original M11 intent: once FlashSale is actually built (M3-M10), watch for
anything you had to bend `common/` to fit, and fix `common/` itself rather
than special-casing FlashSale.

---

## 12. Verification

**Per experiment** — an experiment counts as complete only when its file has all of:
`## Hypothesis`, `## Prediction` (written before the run), `## Setup` (config diff), `## Result` (numbers + graph), `## Diagnosis` (evidence, not guess), `## Fix`, `## After` (same load, re-run), `## Lesson`, `## New tradeoff introduced`.

**Per milestone:**

```bash
lab up flashsale v3 --profile nano
lab exp start cache-stampede
lab load flashsale hot-key --rate 400 --duration 120s
lab break cache-expire --key product:42
lab exp end
lab exp diff EXP-012 EXP-013
```

Must produce a before/after table with p50/p95/p99, error rate, DB QPS, cache hit ratio — and a Grafana screenshot in `results/`.

**Framework acceptance (M11):**
1. `lab new <name>` scaffolds a working v0 in under 30 minutes.
2. Adding a cache to any system = include `redis.yml` + import `@lab/lld` `Cache`. Zero new framework code.
3. Every k6 profile in `common/load/profiles/` runs against system 02 unmodified.
4. Every fault in `common/chaos/faults/` applies to system 02 unmodified.
5. Same experiment, same profile, run twice → results within 10%.

---

## 13. Rules (guardrails against scope explosion)

1. **Do not optimize without first reproducing the failure.** Every architectural change needs an ADR linked to the experiment that forced it.
2. **Change one thing per experiment.** Same framework, same seed data, same load profile — only the variable under test moves. Otherwise the comparison is worthless.
3. **Do not inject chaos before observability exists.** M1 comes before everything.
4. **Do not install Redpanda before v6.** Do not install Kubernetes at all in system 01.
5. **Write the prediction before the run.** Every time. Wrong predictions are the highest-value output of this project.
6. **Default to `nano` profile.** Reach for `small` only when a specific experiment needs headroom.
7. **Real infra, hand-written policy.** Don't reimplement Postgres. Do hand-write every retry, breaker, pool, and limiter — that's the LLD you're here for.
8. **Never average latency.** Percentiles only, from histograms.
9. **During an FDE drill, do not redesign the architecture** unless the incident itself proves an architectural deficiency. Restore SLO first, root cause second, harden third.

---

## 14. First three actions

1. `brew install orbstack k6 libpq` — set the VM to 6 CPU / 8 GB.
2. Create the tree in §3, write `README.md` and `pnpm-workspace.yaml`, copy this file to `ROADMAP.md` and Desktop.
3. Build M1 in this order: `base.yml` → `observability.yml` → `nano.env` → `lab up` / `lab down`. Get Grafana showing live container CPU **before** writing a single line of FlashSale code.
