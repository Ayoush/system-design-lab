// Sudden burst — low baseline, instant jump to a high rate, back down.
// For "does the system recover after a shock" experiments — queue backlog,
// backpressure, autoscaling-that-doesn't-exist-yet, retry storms.
//
// Usage: k6 run common/load/profiles/spike.js -e BASE_RATE=20 -e SPIKE_RATE=400 -e SPIKE_DURATION=20s
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, defaultThresholds } from '../lib/common.js';

const baseRate = Number(__ENV.BASE_RATE) || 20;
const spikeRate = Number(__ENV.SPIKE_RATE) || 400;
const spikeDuration = __ENV.SPIKE_DURATION || '20s';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: baseRate,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [
        { target: baseRate, duration: '20s' },   // establish baseline
        { target: spikeRate, duration: '2s' },   // sudden jump — this is the "spike"
        { target: spikeRate, duration: spikeDuration },
        { target: baseRate, duration: '5s' },    // drop back — does it recover, or stay broken?
        { target: baseRate, duration: '20s' },
      ],
    },
  },
  thresholds: defaultThresholds,
};

export default function () {
  const res = http.get(`${targetUrl()}/`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
