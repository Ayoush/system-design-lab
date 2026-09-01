// Shared helpers every load profile imports. The one rule that matters most
// in this whole file: every profile uses OPEN-LOOP executors
// (constant-arrival-rate / ramping-arrival-rate), never a plain iteration
// loop. A closed-loop generator waits for each response before sending the
// next one — when the server slows down, the generator slows down too,
// hiding exactly the failure you're trying to measure. This is called
// "coordinated omission" and it makes your p99 graph lie to you. See
// common/playbooks/measurement-honesty.md.

export function targetUrl() {
  return __ENV.TARGET_URL || 'http://localhost:8080';
}

// Standard thresholds every profile should at least consider — not
// enforced globally since each experiment's SLO differs, but this is the
// shape to copy into a system's own k6 script.
export const defaultThresholds = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<1000'],
};

// A flat, sustained rate for the whole duration — the workhorse executor
// for "find the knee" experiments (ramp up manually across repeated runs)
// and baseline measurement.
export function constantArrival({ rate = 50, duration = '60s', preAllocatedVUs = 50, maxVUs = 500 } = {}) {
  return {
    executor: 'constant-arrival-rate',
    rate,
    timeUnit: '1s',
    duration,
    preAllocatedVUs,
    maxVUs,
  };
}

// Smooth ramp from startRate to targetRate — for "increase load until it
// breaks" experiments where you want ONE run to sweep the whole range
// instead of many manual runs.
export function rampingArrival({ startRate = 5, targetRate = 200, duration = '2m', preAllocatedVUs = 50, maxVUs = 1000 } = {}) {
  return {
    executor: 'ramping-arrival-rate',
    startRate,
    timeUnit: '1s',
    preAllocatedVUs,
    maxVUs,
    stages: [{ target: targetRate, duration }],
  };
}
