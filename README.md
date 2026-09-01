# System Design Lab

A personal, local, disposable lab for learning HLD and LLD by hand — build a
deliberately naive system, break it under measured load, diagnose the real
bottleneck, introduce one component at a time, repeat. Full rationale,
philosophy, and the ~500-system framework design is in [`ROADMAP.md`](./ROADMAP.md).

Core loop:

```
naive design → break it under load → diagnose → add ONE component → measure → break again
```

Everything here runs in Docker, shrunk to laptop-sized capacity (a "nano"
profile — tiny CPU/memory/connection limits) so real bottlenecks show up in
seconds instead of needing 1M real requests.

**Status: the framework is built and fully verified end-to-end. Every piece
below has actually been booted, tested, and proven working — not just
written.** What's left is the actual design/engineering work: FlashSale
itself (`systems/01-flashsale/`).

---

## Layout

```
system-design-lab/
├── lab                     the CLI — one command drives everything below
├── ROADMAP.md              full plan: philosophy, framework design, FlashSale experiment matrix
├── pnpm-workspace.yaml     links @lab/lld into every system's app code
│
├── common/                 ══ THE FRAMEWORK — reused by every future system ══
│   ├── infra/               docker-compose fragments (network, db, cache, queue, LB, chaos proxy, observability)
│   │   └── profiles/         nano/tiny/small — the "how easily does this break" dial
│   ├── services/dep-sim/    fake external dependency (payment/email/SMS) — real code, not a stub
│   ├── load/                 k6 open-loop load library (6 reusable profiles)
│   ├── chaos/                fault injection scripts (kill, latency, cache outage, dep failure, ...)
│   ├── lld/                  @lab/lld — YOUR hand-written component library (empty scaffold, on purpose)
│   ├── observability/        prometheus + grafana provisioning (auto-wired, zero manual UI clicks)
│   ├── playbooks/            7 reference docs: diagnosis, DB bottlenecks, capacity math, FDE rules, ...
│   └── templates/            experiment / ADR / HLD / LLD doc templates
│
└── systems/
    ├── 00-TEMPLATE/          what `./lab new <name>` copies to scaffold a new system
    └── 01-flashsale/         first system — problem statement is written, design is not (that's yours)
```

---

## Prerequisites (installed once, M0 — done)

| Tool | Install | Why |
|---|---|---|
| OrbStack | `brew install orbstack` | Docker daemon for macOS |
| k6 | `brew install k6` | load generator (open-loop) |
| libpq (`psql`) | `brew install libpq`, then add to PATH | inspect Postgres directly |
| jq | `brew install jq` | the `lab` CLI and chaos scripts use it |
| pnpm | already present | workspace linking for `@lab/lld` |

Verify:
```bash
./lab setup
```

---

## The `lab` CLI

```
lab setup                                    verify prerequisites
lab new <name>                                scaffold systems/NN-<name>/ from template

lab up <system> <version> [--profile p]       bring a system version up
lab down <system> [<version>]                 tear it down
lab reset <system> <version> [--profile p]    wipe volumes, fresh start
lab ps  <system> [<version>]                  show running containers

lab seed <system> [args...]                   run systems/<s>/scripts/seed.sh
lab load <system> <profile> [-- k6-args...]   run a k6 load profile
lab break <fault> [args...]                   inject a fault
lab heal                                      remove all active faults

lab exp start <slug>                          begin a numbered experiment (writes template, remembers t0)
lab exp end                                   close it, pulls Prometheus numbers into the file automatically
lab exp diff <A> <B>                          compare two experiments' Result sections
```

It remembers the last `system`/`version`/`profile` you used (in `.lab/state`,
gitignored) so you don't repeat them on every command.

**How a system declares its infra:** each version has a manifest file,
`systems/<system>/infra/<version>.stack` — plain text, one compose fragment
path per line. `lab up flashsale v3` reads `v3.stack`, builds the `-f`
argument list from it, and runs compose. Adding a component to a version is
adding one line to that file. See `systems/00-TEMPLATE/infra/v0.stack` for
the shape.

---

## Progress

- [x] **M0 — machine setup.** OrbStack, Docker daemon, 6 CPU/8GiB, k6, psql, jq, git.
- [x] **M1 — full framework skeleton, verified end-to-end:**
  - [x] Shared network (`base.yml`)
  - [x] Observability: Prometheus + Grafana (auto-provisioned datasource + dashboard) + cAdvisor — proven: live container CPU/memory visible with zero app code running
  - [x] Postgres primary + **real streaming replica** (verified: `pg_stat_replication` shows `streaming`, replica confirms `pg_is_in_recovery() = true`)
  - [x] Redis (shrunk maxmemory + LRU eviction, for stampede/hot-key experiments)
  - [x] PgBouncer connection pooler (verified: query round-trips through it)
  - [x] Redpanda + Redpanda Console (Kafka-API compatible, no ZooKeeper)
  - [x] nginx (LB entrypoint convention: `localhost:8080`)
  - [x] Toxiproxy (network fault injection — verified: latency toxic added, observed, removed)
  - [x] dep-sim (hand-rolled fake external dependency with live-configurable latency/failure rate + its own Prometheus metrics)
  - [x] 3 resource profiles (nano/tiny/small)
  - [x] `lab` CLI — every subcommand tested for real (`setup`, `new`, `up`, `exp start`, `exp end`)
  - [x] pnpm workspace (`@lab/lld` scaffold, install verified)
- [x] **M2 — load + chaos:**
  - [x] k6 open-loop load library — 6 profiles (steady, ramp, spike, flash-sale, hot-key, soak), smoke-tested for real (confirmed 10.19 iters/s at RATE=10)
  - [x] Chaos fault library — kill/pause container, DB latency (toxiproxy), cache outage, dependency failure (dep-sim), connection exhaustion, and `heal` to clear everything — all tested live
- [x] **Playbooks** — diagnose loop, DB bottleneck decision tree, capacity math (Little's Law / M/M/1 / USL), measurement honesty (coordinated omission), failure taxonomy, SLO guidance, FDE rules
- [x] **Templates** — experiment/ADR/HLD/LLD doc shapes, `00-TEMPLATE` system scaffold
- [x] **FlashSale problem statement** — schema, API, SLO, deliberate v0 bugs, version ladder (see `systems/01-flashsale/README.md`)
- [ ] **Next: yours.** Write `systems/01-flashsale/docs/hld/v0.md`, then the schema migration, then the naive v0 app — deliberately with the 8 bugs listed in its README. `@lab/lld` stays empty until an experiment forces the first component.

---

## Pitfalls hit during the build, and how to spot them yourself

Every one of these was a real failure encountered and fixed while building
this framework — not hypothetical. Kept here because the debugging method
matters more than the specific fix.

### 1. Docker daemon not running ≠ Docker not installed
```
failed to connect to the docker API at unix:///.../docker.sock
```
The `docker` CLI can be fully installed while the daemon (OrbStack app)
isn't running. Always check first: `docker info >/dev/null 2>&1 && echo UP || echo DOWN`.
Fix: `open -a OrbStack`.

### 2. Relative volume paths resolve against the compose file's OWN folder, not your cwd
```
error mounting ".../common/infra/common/observability/prometheus/prometheus.yml"
```
Note the doubled path segment — that's the signature. Compose's default
"project directory" (what relative `./paths` resolve against) is the folder
of the FIRST `-f` file, not wherever you ran the command from. **Always
pass `--project-directory .` from repo root** — every command in this repo
does. Absolute paths (`/rootfs`, `/sys`, ...) are immune to this; only
relative bind-mount paths are at risk.

### 3. `docker compose config` hides an unused top-level `networks:` block
Not a bug. It only prints `networks:` if some service actually references
it via `networks: [lab]`. Reappears the moment a service does.

### 4. Bare compose flags need a space
`-fcommon/infra/observability.yml` silently misparses. Always `-f path`.

### 5. Nesting a bind-mount inside an already-read-only bind-mount fails
```
mkdirat .../etc/grafana/provisioning/dashboards/lab: read-only file system
```
Mounting folder A read-only, then trying to mount folder B AT A PATH INSIDE
A, fails at the OCI runtime level — you can't create a new mountpoint
inside a directory that's already a read-only mount. Fix: mount B at a
completely separate, unrelated path instead of nesting it (see
`common/infra/observability.yml` — grafana's dashboard JSON mounts to
`/var/lib/grafana/dashboards`, deliberately NOT under
`/etc/grafana/provisioning/dashboards`).

### 6. Port conflicts between fragments show up as the LAST container failing, not the one that "owns" the port
`cadvisor` and `nginx` both defaulted to host port `8080`. The error
appears on whichever container starts second, even though both are
"correct" in isolation. When merging many fragments, check for a
port-conflict class of bug specifically — grep every fragment's `ports:`
block for overlaps before combining them for the first time.

### 7. A container that half-failed to start can look "Up" while its port mapping silently didn't apply
After fixing the port conflict above, `nginx` reported `Up 46 seconds` but
`docker port nginx` returned nothing — it was a leftover container object
from the earlier failed attempt that Compose didn't automatically recreate
since its declared config hadn't changed. `docker compose up -d
--force-recreate <service>` fixes it. **Lesson: "Up" in `docker ps` proves
the process is running, not that its networking actually attached — verify
the actual port binding with `docker port <name>` when something seems
reachable but isn't.**

### 8. Third-party image tags can just disappear
```
failed to resolve reference "docker.io/bitnami/pgbouncer:1.22.1": not found
```
Bitnami restructured their registry and archived old tags to a deprecated
`bitnamilegacy` namespace. **Before pinning any third-party image tag,
verify it actually resolves**, e.g.:
```bash
curl -s "https://hub.docker.com/v2/repositories/<org>/<repo>/tags?page_size=20&ordering=last_updated" | jq -r '.results[].name'
```
Switched to `edoburu/pgbouncer`, which is actively maintained.

### 9. An image's *internal* listening port can differ from what you assume
`edoburu/pgbouncer` hardcodes its listen port to `5432` (mirrors Postgres
on purpose, so an app can point at it as a drop-in). Our `6432:6432` port
mapping was wrong on both sides — host AND the assumption that other
containers could reach it at `:6432`. Verify with:
```bash
docker exec <container> cat /path/to/config | grep -i listen_port
```
Fixed to `6432:5432`, and every other container on the network reaches it
as `pgbouncer:5432`, not `:6432`.

### 10. Auth method mismatches between a pooler and Postgres's actual default
```
FATAL: server login failed: wrong password type
```
PgBouncer was configured for `md5` auth; Postgres 16 defaults to
`scram-sha-256` password hashing. The pooler's auth type must match what
Postgres actually stores, not an assumed default.

### 11. Some minimal/distroless images have no shell at all
```
OCI runtime exec failed: exec: "/bin/sh": stat /bin/sh: no such file or directory
```
Toxiproxy's image ships as a single static binary with nothing else — a
`CMD-SHELL`-based healthcheck can never run there, regardless of whether
the service itself is healthy. When a healthcheck fails but the service
clearly works (`curl` the actual endpoint to confirm), suspect the image
has no shell before suspecting the service.

### 12. macOS thermal throttling can quietly corrupt later load-test results
Not hit yet — flagging ahead of M3+. Run every load experiment twice,
discard the first run.

### 13. Closed-loop load generators lie about failure
Not hit yet — flagging ahead of time. Never load-test with a naive loop or
plain `wrk`. See `common/playbooks/measurement-honesty.md` — coordinated
omission is the single most common way people fool themselves in this kind
of lab.

### 14. A schema mismatch between a reusable load profile and a specific app's required fields
`common/load/profiles/flash-sale.js`'s checkout didn't send `userId`,
which `orders.user_id` requires `NOT NULL`. Every checkout attempt failed
identically. **When a shared/reusable script talks to a new system for the
first time, verify its payload shape against that system's actual schema
before trusting a load test's results** — a shared script written before
the schema existed is exactly where this kind of drift creeps in. Fixed by
adding a `fakeUuid()` helper to `common/load/lib/common.js` (deterministic,
syntactically valid, doesn't need real crypto) so any future load profile
needing a fake user/entity id has one ready.

### 15. An async Express 4 handler that throws crashes the WHOLE process, not just that request
```
error: null value in column "user_id" ... violates not-null constraint
Node.js v20.20.2
```
Express 4 auto-catches a *synchronous* throw inside a route handler, but
NOT a rejected promise from an `async` handler — that becomes an unhandled
promise rejection, and Node's default behavior is to crash the process
entirely. A single bad request can take the whole server down, not just
fail with a 500. This is NOT one of FlashSale's 8 deliberate v0 bugs
(those demonstrate scaling/consistency concepts) — a server that dies on
malformed input makes every experiment unreliable, so it got fixed
immediately: every route handler wrapped in an `asyncHandler()` utility
(`systems/01-flashsale/src/async-handler.ts`) that forwards the rejection
to `next(err)`, plus a catch-all error middleware in `server.ts`. **Any
future system's Express app needs the same wrapper from day one** — this
isn't specific to FlashSale.

### 16. `scrape_config_files` needs the `scrape_configs:` wrapper key after all
```
cannot unmarshal !!seq into config.ScrapeConfigs
```
Prometheus's `scrape_config_files` extension mechanism (used so a system
can add its own scrape target without editing `common/`) was written from
memory as "a bare YAML list, no wrapper key" — wrong, at least on
v2.54.1. It needs the exact same shape as the main config file: a
top-level `scrape_configs:` key wrapping the list. Confirmed empirically
by testing both. **When a doc/memory and the actual tool disagree, trust
a live test over recollection** — this is why every fragment in this repo
that touches a real external tool got booted and checked, not just written.

---

## Conventions

- Every third-party image gets a pinned version — **and that pin gets
  verified to actually resolve** before it's trusted (pitfall #8).
- Every fragment gets inline comments explaining *why*, not just *what*.
- Named volumes only, never bind mounts for stateful data (macOS bind-mount
  I/O is bad and pollutes measurements) — bind mounts are fine for
  read-only config files.
- One command, one clear success signal. If a step doesn't have an obvious
  "did this work?" check, it isn't done yet.
- `common/` never contains anything specific to FlashSale or any other
  single system. If it's system-specific, it belongs in `systems/<name>/`.
