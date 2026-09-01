```mermaid
graph TD
    Client["Client"] -->|"GET /products/:id<br/>POST /orders"| API["api (1x)<br/>Express + raw pg"]

    API -->|"1 . SELECT inventory<br/>(read check)"| DB[("postgres (1x)")]
    API -->|"2 . INSERT order<br/>status=pending"| DB
    API -->|"3 . charge — NO TIMEOUT"| Dep["dep-sim<br/>fake payment"]
    API -->|"4 . sleep ~100ms<br/>(simulated email)"| API
    API -->|"5 . sleep ~30ms<br/>(simulated analytics)"| API
    API -->|"6 . UPDATE inventory -= qty<br/>(write, no guard)"| DB
    API -->|"7 . UPDATE order status=paid"| DB

    classDef normal fill:#1e293b,stroke:#94a3b8,color:#fff,stroke-width:1px
    classDef broken fill:#7f1d1d,stroke:#e11d48,color:#fff,stroke-width:2px
    class API,Dep normal
    class DB broken

    linkStyle 1 stroke:#e11d48,stroke-width:3px
    linkStyle 3 stroke:#e11d48,stroke-width:3px
    linkStyle 6 stroke:#e11d48,stroke-width:3px
```

## What's red, and why

| Element | Bug | Proven by |
|---|---|---|
| `postgres` box | single instance, untuned pool, no replica | forced at v1 (`ConnectionPool`), v2 (replica) |
| edge 1 (`SELECT inventory`) + edge 6 (`UPDATE inventory`) | **inventory race** — the read and the write are 5 steps apart, nothing atomic, nothing locked | EXP-003 — confirmed live: inventory `-17`, 28 orders sold against 10 stock |
| edge 3 (`charge`, api → dep-sim) | **no timeout** — a hung dep-sim hangs this request forever | `common/chaos/faults/dep-fail.sh` |
| `api` box | single instance — no LB, dies = whole system down | forced at v1 |

## What's explicitly NOT here yet

No nginx, no load balancer, no cache, no queue, no read replica, no
connection pooler. One box per component, on purpose — this is the
before-picture. Compare against `docs/hld/v1.md` once it exists to show
the audience the diff, one box at a time.
