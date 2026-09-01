# Failure Taxonomy

Every fault you inject or discover belongs to one of these categories.
Naming the category is the first step of diagnosis — it narrows which
playbook applies.

| Category | Meaning | Example |
|---|---|---|
| **CAPACITY** | something ran out of a finite resource | DB connection pool exhausted |
| **CONSISTENCY** | data ended up in a state it shouldn't be in | double-charged order, oversold inventory |
| **DEPENDENCY** | a thing you call stopped working | Redis unavailable, payment API down |
| **NETWORK** | the path between two things degraded | 800ms added DB latency, packet loss |
| **CONFIGURATION** | something was set up wrong | LB health check pointed at wrong path |
| **DEPLOYMENT** | a release introduced the problem | buggy version rolled out |
| **STATE** | something that should have persisted didn't | in-memory data lost on restart |
| **DATA** | the input itself is bad | malformed/poison message |
| **BACKPRESSURE** | producers outpaced consumers with no limit | queue depth growing unbounded |
| **OBSERVABILITY** | you couldn't see the problem, not that there wasn't one | missing request ID, no trace context |
| **HUMAN ERROR** | a person did the wrong thing | wrong env var, typo in config |

When you write up an experiment or a chaos drill, tag it with one (or more)
of these — it makes the experiment log searchable later, and forces you to
be precise about WHAT kind of thing actually broke instead of just "it
broke."
