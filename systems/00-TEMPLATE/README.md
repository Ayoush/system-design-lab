# {{SYSTEM_NAME}}

## Problem statement
<!-- What does this system do, in plain language? -->

## Requirements
<!-- Functional requirements as a numbered list. -->

## API
<!-- Endpoints, even rough ones, before you write any code. -->

## SLO
<!-- p99 target, error rate target, and the one invariant that must never break. -->

---

## Running this system

```bash
../../lab up {{SYSTEM_NAME}} v0
../../lab load {{SYSTEM_NAME}} steady -e RATE=20 -e DURATION=30s
../../lab down {{SYSTEM_NAME}}
```

See `infra/v0.stack` for exactly which compose fragments make up v0 — add a
new `.stack` file (`v1.stack`, `v2.stack`, ...) each time you add a
component, and a matching `infra/vN.yml` for anything system-specific in
that version.
