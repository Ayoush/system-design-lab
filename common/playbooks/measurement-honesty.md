# Measurement Honesty

A number you can't trust is worse than no number — it tells you the wrong
thing with total confidence.

## Coordinated omission — the biggest trap

A CLOSED-LOOP load generator (a naive `for` loop, or `wrk` in its default
mode) waits for each response before sending the next request. When the
server slows down, the GENERATOR slows down too — it sends fewer requests
exactly when the server is struggling, which hides the failure in the
p99 you're trying to measure.

**Rule: always use an OPEN-LOOP executor.** `k6`'s `constant-arrival-rate`
(or `ramping-arrival-rate`) keeps firing at a fixed rate regardless of how
the server responds — that's the only way the latency graph tells the
truth. Every profile in `common/load/profiles/` is already built this way.
If you ever write a new load script, do NOT reach for a plain iteration
loop.

## Repeat every run, discard the first

macOS will thermal-throttle under sustained load. A laptop that's been
idle runs faster for the first ~30-60s than it does once it's warm. Run
every experiment twice, throw away the first run's numbers, and note if
they look inconsistent — that's thermal state, not your system changing.

## Warmup matters

The first requests against a cold cache, a cold connection pool, or a JIT
that hasn't compiled hot paths yet are NOT representative. Give a load
test 10-20s of ramp before you start trusting the numbers, or explicitly
separate "warmup" and "measurement" phases in the k6 script.

## Never trust an average

Average latency hides exactly the tail behavior you're trying to catch.
Two systems can have the same average with wildly different p99s. Always
look at p50/p95/p99 from a real histogram — every dashboard in this lab is
built around that, never a raw average.

## A wrong number you can explain beats a right number you can't reproduce

If a run's numbers look surprising, the first move is "run it again with
the exact same setup" — not "adjust the story to fit the number." If it
doesn't reproduce, something about the run itself was the variable, not
the system.
