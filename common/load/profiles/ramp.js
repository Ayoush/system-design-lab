// Sweeps from a low rate up to a target rate over one run — use this to
// FIND the knee (the point where p99 stops being flat and starts climbing)
// without needing to manually run steady.js at 10 different rates.
//
// Usage: k6 run common/load/profiles/ramp.js -e START_RATE=5 -e TARGET_RATE=300 -e DURATION=3m
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, rampingArrival, defaultThresholds } from '../lib/common.js';

export const options = {
  scenarios: {
    ramp: rampingArrival({
      startRate: Number(__ENV.START_RATE) || 5,
      targetRate: Number(__ENV.TARGET_RATE) || 300,
      duration: __ENV.DURATION || '3m',
    }),
  },
  thresholds: defaultThresholds,
};

export default function () {
  const res = http.get(`${targetUrl()}/`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
