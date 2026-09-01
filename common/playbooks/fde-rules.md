# FDE Investigation Rules

For blind chaos drills (M10) and any time something breaks that you didn't
plan. Production-style debugging, not architecture review.

## Rule 1 — Start with symptoms, not code

Don't open source files first. Start with what's observable: traffic,
latency, errors, saturation, dependency health, what changed recently.

## Rule 2 — Find the budget-burning hop

Trace the request path:
```
Client → LB → API → Cache → Pool → DB → Queue/Kafka → Worker → External dep
```
Which hop is where the latency/error budget actually got spent? Everything
upstream of that hop is a red herring.

## Rule 3 — Establish blast radius before digging deeper

Is this affecting: one request? one user? one node? one dependency? all
reads? all writes? the entire system? The answer changes how urgently you
need to mitigate vs how much time you have to investigate.

## Rule 4 — Mitigate before you fully understand

If one API node is unhealthy → pull it from the LB. If a replica is
broken → route critical reads to primary. If a consumer is stuck retrying
poison messages → pause it. Restore service FIRST, understand root cause
SECOND, harden THIRD. Don't wait for a complete diagnosis before reducing
harm.

## Rule 5 — One change at a time

Change one thing, observe the effect, then decide the next move. Five
simultaneous changes means you'll never know which one actually fixed (or
worsened) anything.

## Rule 6 — Preserve evidence

Don't restart things reflexively — logs, metrics, and container state at
the moment of failure are the evidence. Capture before you clear.

## Rule 7 — Do not redesign mid-incident

Unless the incident itself proves an actual architectural deficiency (not
just "this would be nicer"), the fix during an incident is operational —
config, routing, scaling a knob you already have. Redesign happens later,
as its own deliberate ADR.
