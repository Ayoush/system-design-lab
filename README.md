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

---

## Layout

```
system-design-lab/
├── ROADMAP.md            full plan: philosophy, framework design, FlashSale experiment matrix
├── common/                reusable framework — shared by every future system
│   ├── infra/             docker-compose fragments (network, observability, db, cache, ...)
│   └── observability/      prometheus/grafana config
└── systems/
    └── 01-flashsale/       first system built on the framework (in progress)
```

The framework idea: every system design ("add a load balancer", "add a cache",
"add read replicas") maps to **one more `-f` fragment** stacked onto a
`docker compose` command, plus a resource profile that decides how easily it
breaks. Nothing here is FlashSale-specific except the `systems/01-flashsale/`
folder itself.

---

## Prerequisites (installed once, M0)

| Tool | Install | Why |
|---|---|---|
| OrbStack | `brew install orbstack` | Docker daemon for macOS — lighter than Docker Desktop |
| k6 | `brew install k6` | load generator (open-loop — see pitfalls below) |
| libpq (`psql`) | `brew install libpq`, then `echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc` | inspect Postgres directly later |

**OrbStack setup, one-time:**
1. Open the app, choose **Docker** (not Kubernetes, not Linux machine) when asked.
2. Settings → System → set **CPU 6 / Memory 8 GiB** (leaves headroom for k6 + your editor to run without starving each other).

Verify everything is ready:

```bash
docker info >/dev/null 2>&1 && echo "daemon UP" || echo "daemon DOWN — open OrbStack.app"
docker info | grep -iE "cpus|total memory"
k6 version
psql --version
```

---

## Standard way to run anything here

**Always run from the repo root, always pass `--project-directory .`:**

```bash
cd ~/Documents/system-design-lab
docker compose --project-directory . -f common/infra/base.yml -f common/infra/observability.yml up -d
```

Why `--project-directory .` is non-negotiable — see Pitfall #2 below. Every
future command (adding postgres, redis, the flashsale app itself) follows this
same pattern: one growing list of `-f` fragments, always this one flag.

To stop everything:

```bash
docker compose --project-directory . -f common/infra/base.yml -f common/infra/observability.yml down
```

To see what's running:

```bash
docker compose --project-directory . -f common/infra/base.yml -f common/infra/observability.yml ps
```

---

## Progress so far (M0 → M1 in progress)

- [x] **M0 — machine setup.** OrbStack installed, Docker daemon confirmed up, resources set to 6 CPU / 8 GiB, k6 + psql installed, repo scaffolded, git initialized.
- [x] `common/infra/base.yml` — the shared `lab-net` Docker network every future fragment attaches to. No services in this file on purpose.
- [x] `common/infra/observability.yml` — Prometheus + Grafana + cAdvisor. First real services in the lab, chosen deliberately to run *before* any app code exists, so nothing ever gets built or broken without being able to see it.
- [x] `common/observability/prometheus/prometheus.yml` — scrape config: polls itself and cAdvisor every 15s.
- [x] Verified: `http://localhost:9090/targets` shows both jobs **UP**. Grafana reachable at `http://localhost:3000`.
- [ ] **Next:** wire cAdvisor's container metrics into a Grafana dashboard (so CPU/memory of any future container is visible without touching Prometheus's raw UI), then start on FlashSale v0.

---

## Pitfalls hit so far, and how to spot them yourself

### 1. Docker daemon not running ≠ Docker not installed

Symptom:
```
failed to connect to the docker API at unix:///.../docker.sock:
dial unix .../docker.sock: connect: no such file or directory
```
The `docker` CLI can be installed and fully working while the actual daemon
(OrbStack app) isn't running. The CLI is just a client — it needs something to
talk to.

**Check first, always, before debugging anything else:**
```bash
docker info >/dev/null 2>&1 && echo UP || echo DOWN
```
Fix: `open -a OrbStack`, wait ~10s, recheck.

---

### 2. Relative volume paths resolve against the wrong folder

Symptom:
```
error mounting ".../common/infra/common/observability/prometheus/prometheus.yml"
to rootfs at "/etc/prometheus/prometheus.yml": ... not a directory
```
Note the **doubled path segment** — `common/infra/common/observability/...`.
That duplication is the signature of this exact bug class.

**Why it happens:** Compose resolves every relative (`./...`) volume path
against a "project directory," which **defaults to the folder of the first
`-f` file you pass** — not the folder you're standing in when you run the
command. A path written assuming "relative to repo root" silently breaks the
moment the compose file containing it isn't itself sitting at repo root.

**How to spot it yourself:** Docker's error message always prints the exact
resolved path it tried to use. Read it literally, character by character,
against what you intended — don't guess. A repeated folder name in the path
is the tell.

**Fix, and the rule going forward:** always invoke compose with
`--project-directory .` from repo root. This pins path resolution to one
fixed point regardless of which fragment files get combined or in what order
— essential once we're stacking `common/infra/*.yml` with
`systems/01-flashsale/infra/*.yml` in the same command.

**Side confirmation this was the right diagnosis:** container name prefixes
changed from `infra-grafana-1` to `system-design-lab-grafana-1` the moment
`--project-directory .` was added — Compose's *project name* is derived from
the same mechanism as path resolution, so fixing one visibly fixed the other.

**Absolute paths never hit this.** cAdvisor's mounts (`/rootfs`, `/sys`, ...)
start with `/` and are unaffected by project-directory — that's why only the
prometheus service broke, not cAdvisor. If you ever need to decide whether a
new volume path is at risk of this bug: relative path → at risk, absolute
path → safe.

---

### 3. `docker compose config` won't show an unused top-level `networks:` block

Not a bug — expected behavior. `config` only prints a top-level `networks:`
entry if at least one **service** actually references it via
`networks: [lab]`. `base.yml` alone (network defined, zero services) will
correctly print `services: {}` and silently omit the network block. It
reappears the moment a service in another fragment references it.

---

### 4. Bare compose flags need a space

`-fcommon/infra/observability.yml` (no space after `-f`) silently gets parsed
wrong or errors unclearly. Always `-f common/infra/observability.yml` — space
required, `-f` and `--file` both need it.

---

### 5. macOS thermal throttling will quietly corrupt later load-test results

Not hit yet, but will matter once k6 tests start (M2+). Repeated runs on a
laptop can slow down purely from heat, not from anything you changed. **Run
every load experiment twice, discard the first run**, and note ambient state
if numbers look inconsistent.

---

### 6. Closed-loop load generators lie about failure (coming in M2)

Not hit yet — flagging ahead of time. Never load-test with a naive loop or
plain `wrk`. A generator that waits for each response before sending the next
one *slows down* exactly when the server is struggling, hiding the failure
you're trying to measure (**coordinated omission**). k6's
`constant-arrival-rate` executor keeps firing at a fixed rate regardless of
server health — that's the only way the P99 graph tells the truth.

---

## Conventions

- Every file gets pinned image versions, never `:latest` — reproducibility.
  A bug you can't reproduce twice isn't a bug you can learn from.
- Every fragment gets inline comments explaining *why*, not just *what* —
  this file and the compose files themselves double as your own YAML
  reference material.
- One command, one clear success signal. If a step doesn't have an obvious
  "did this work?" check, it isn't done yet.
