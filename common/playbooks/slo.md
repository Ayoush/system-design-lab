# Setting an SLO

Set this at v1 (once you have a scaled, non-naive version) and defend it
from there on. Every later experiment either respects it or explains why
it broke it.

## Shape of an SLO

```
p99 latency  < X ms      — the tail, not the average
error rate   < Y%        — 5xx + timeouts, over a rolling window
invariant    always true — the one thing that must NEVER be violated
                             regardless of latency or errors
                             (e.g. "inventory never goes negative")
```

## Picking numbers that mean something

Don't invent a number — derive it from what the "user" would tolerate.
For a checkout flow, ~300ms p99 is a reasonable target (fast enough to
feel instant, loose enough to allow one DB round trip plus a cache check).
For a background job, the SLO might be about completion time, not
per-request latency at all.

## Error budget

If your error rate SLO is 0.5%, that's your budget for controlled risk —
deploys, experiments, chaos drills. Spending it on a genuine incident vs
spending it on an experiment you ran on purpose are different things;
track which is which.

## The one invariant

Separate from latency/error SLOs, name the single thing that must be true
NO MATTER WHAT. For FlashSale it's "inventory never goes negative." A
system can miss its latency SLO and still be "up" in a meaningful sense.
A system that violates its invariant is broken regardless of how fast it
responded.
