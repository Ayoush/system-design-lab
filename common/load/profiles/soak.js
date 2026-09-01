// Long-duration, moderate, steady load — NOT about finding the knee, about
// finding what only shows up over time: slow memory growth, connection
// leaks, unbounded queue growth that a 60s test never reveals.
//
// Usage: k6 run common/load/profiles/soak.js -e RATE=30 -e DURATION=30m
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, constantArrival, defaultThresholds } from '../lib/common.js';

export const options = {
  scenarios: {
    soak: constantArrival({
      rate: Number(__ENV.RATE) || 30,
      duration: __ENV.DURATION || '30m',
      preAllocatedVUs: 30,
      maxVUs: 200,
    }),
  },
  thresholds: defaultThresholds,
};

export default function () {
  const res = http.get(`${targetUrl()}/`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
