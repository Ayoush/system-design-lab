# The Diagnostic Loop

Use this exact sequence for every experiment, every incident, no exceptions.

```
OBSERVE
  ↓
LOCATE
  ↓
HYPOTHESIZE
  ↓
EXPERIMENT
  ↓
MITIGATE
  ↓
VERIFY
  ↓
BREAK AGAIN
```

## 1. OBSERVE
What changed? Name the actual metrics that moved — "p95 latency 40ms → 1.8s,
error rate 0% → 7%, DB CPU 35% → 98%." Not "it's slow."

## 2. LOCATE
Where in the request path is it? Trace the hop:
`client → LB → API → cache → pool → DB → queue → worker → external dep`
Which hop consumed the budget?

## 3. HYPOTHESIZE
Why, specifically? "The database is saturated because identical product
reads are reaching it repeatedly" — not "database is slow."

## 4. EXPERIMENT
Can you prove it? Inspect the query plan, toggle the cache on/off, reproduce
under controlled load. Don't guess — check.

## 5. MITIGATE
Apply the SMALLEST useful change. Add a cache, not a new architecture.

## 6. VERIFY
Same load, same profile, before vs after. If you can't show the numbers
side by side, you haven't verified anything.

## 7. BREAK AGAIN
Increase load or introduce the next fault. This step is not optional — a
fix that's never been re-stressed hasn't actually been proven.
