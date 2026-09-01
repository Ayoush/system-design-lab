// The narrative profile: quiet browsing, then the sale opens and everyone
// hits the SAME product at once. This is what actually forces the
// inventory-race experiments (EXP-028-030) to reproduce reliably.
//
// Usage: k6 run common/load/profiles/flash-sale.js -e PRODUCT_ID=42 -e SALE_RATE=500
import http from 'k6/http';
import { check } from 'k6';
import { targetUrl, defaultThresholds } from '../lib/common.js';

const productId = __ENV.PRODUCT_ID || '42';
const saleRate = Number(__ENV.SALE_RATE) || 500;

export const options = {
  scenarios: {
    browsing: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '15s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      exec: 'browse',
    },
    sale: {
      executor: 'constant-arrival-rate',
      rate: saleRate,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 200,
      maxVUs: 3000,
      startTime: '15s',    // starts right as "browsing" scenario ends
      exec: 'checkout',
    },
  },
  thresholds: defaultThresholds,
};

export function browse() {
  const res = http.get(`${targetUrl()}/products/${productId}`);
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}

export function checkout() {
  const res = http.post(
    `${targetUrl()}/orders`,
    JSON.stringify({ productId, qty: 1, idempotencyKey: `${__VU}-${__ITER}` }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'status is not 5xx': (r) => r.status < 500 });
}
