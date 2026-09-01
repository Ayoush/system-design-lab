// Skews almost all traffic onto ONE key (product/user/whatever id) with a
// small remainder spread across others — reproduces cache hot-key
// saturation and hot-row DB contention distinctly from generic load.
//
// Usage: k6 run common/load/profiles/hot-key.js -e HOT_ID=42 -e RATE=300 -e HOT_FRACTION=0.95
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, constantArrival, defaultThresholds } from '../lib/common.js';

const hotId = __ENV.HOT_ID || '42';
const hotFraction = Number(__ENV.HOT_FRACTION) || 0.95;

export const options = {
  scenarios: {
    hotkey: constantArrival({
      rate: Number(__ENV.RATE) || 300,
      duration: __ENV.DURATION || '60s',
    }),
  },
  thresholds: defaultThresholds,
};

export default function () {
  const id = Math.random() < hotFraction ? hotId : String(1 + Math.floor(Math.random() * 1000));
  const res = http.get(`${targetUrl()}/products/${id}`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
