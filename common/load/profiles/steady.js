// Flat, sustained load — the baseline profile. Run this FIRST against any
// new version before touching anything else; every later comparison is
// "vs this number."
//
// Usage: k6 run common/load/profiles/steady.js -e RATE=50 -e DURATION=60s -e TARGET_URL=http://localhost:8080
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, constantArrival, defaultThresholds } from '../lib/common.js';

export const options = {
  scenarios: {
    steady: constantArrival({
      rate: Number(__ENV.RATE) || 50,
      duration: __ENV.DURATION || '60s',
    }),
  },
  thresholds: defaultThresholds,
};

export default function () {
  const res = http.get(`${targetUrl()}/`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
