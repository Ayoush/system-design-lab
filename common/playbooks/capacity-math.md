# Capacity Math — the three formulas that explain almost everything

## Little's Law: concurrency, not request count, costs memory

```
L = λW
```

`L` = number of requests IN FLIGHT at any instant, `λ` = arrival rate
(req/s), `W` = average time each request spends in the system.

Example: 10,000 req/s at 100ms average latency → `L = 1000` — one thousand
requests in flight, not ten thousand. That's why you don't need to
simulate 1M concurrent anything to reason about 1M total requests. Total
request count over time and concurrency at any instant are different
numbers.

## M/M/1: the knee

```
R = S / (1 − ρ)
```

`R` = response time, `S` = raw service time, `ρ` = utilization (`λ/μ`,
arrival rate over capacity).

As `ρ` approaches 1, `R` goes to infinity — not linearly, a cliff. This is
why a system can look totally fine at 60% utilization and fall over
completely at 85%. **Utilization near 100% is not "almost broken," it's
already on the exponential part of the curve.**

## Universal Scalability Law: why adding servers can make things WORSE

```
C(N) = N / (1 + α(N−1) + βN(N−1))
```

`C(N)` = throughput with N nodes, `α` = contention (serialization — e.g.
everyone hitting the same DB), `β` = coherency (cross-talk cost between
nodes — e.g. cache invalidation, consensus).

If `β > 0`, this curve has a maximum and then goes DOWN as N increases
further — adding more servers can reduce total throughput once
coordination overhead between them outgrows the extra capacity each one
provides. This is the real explanation for "we added replicas and it got
slower."

## What breaks a system, in one line

```
ρ = λ/μ > 1
```

Only two levers exist: raise `λ` (more load) or lower `μ` (less capacity).
This lab always prefers lowering `μ` — shrinking CPU/memory/connection
limits — because it reproduces the exact same failure curve on a laptop
that raising `λ` would need real production-scale traffic to show.
