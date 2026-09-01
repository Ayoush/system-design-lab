// dep-sim — a fake external dependency (payment gateway / email / SMS / any
// third-party API). Real production incidents are usually caused by a
// dependency, not your own code — this exists so every future system has
// something realistic to depend on and later fail.
//
// Zero external packages on purpose — just Node's built-in http module —
// so the Docker image builds instantly with no npm install step.

const http = require('http');

// Mutable in-memory config, changed live via POST /control.
// This is how `lab break dep-fail <rate>` actually works — it just calls
// this endpoint, no container restart needed.
let config = {
  latencyMs: 20,
  jitterMs: 10,
  failureRate: 0,        // 0.0–1.0, fraction of calls that return 5xx
};

let requestCount = 0;
let failureCount = 0;
const latencyBuckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];
const latencyHist = new Array(latencyBuckets.length + 1).fill(0);

function recordLatency(ms) {
  const idx = latencyBuckets.findIndex((b) => ms <= b);
  latencyHist[idx === -1 ? latencyBuckets.length : idx]++;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function metricsText() {
  let out = '';
  out += `# HELP depsim_requests_total Total requests handled\n`;
  out += `# TYPE depsim_requests_total counter\n`;
  out += `depsim_requests_total ${requestCount}\n`;
  out += `# HELP depsim_failures_total Total simulated failures returned\n`;
  out += `# TYPE depsim_failures_total counter\n`;
  out += `depsim_failures_total ${failureCount}\n`;
  out += `# HELP depsim_failure_rate Current configured failure rate\n`;
  out += `# TYPE depsim_failure_rate gauge\n`;
  out += `depsim_failure_rate ${config.failureRate}\n`;
  out += `# HELP depsim_latency_ms_bucket Injected latency histogram\n`;
  out += `# TYPE depsim_latency_ms_bucket histogram\n`;
  latencyBuckets.forEach((b, i) => {
    const cumulative = latencyHist.slice(0, i + 1).reduce((a, b) => a + b, 0);
    out += `depsim_latency_ms_bucket{le="${b}"} ${cumulative}\n`;
  });
  const total = latencyHist.reduce((a, b) => a + b, 0);
  out += `depsim_latency_ms_bucket{le="+Inf"} ${total}\n`;
  return out;
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(metricsText());
  }

  if (req.url === '/control' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(config));
  }

  if (req.url === '/control' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const patch = JSON.parse(body || '{}');
      config = { ...config, ...patch };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(config));
    } catch (e) {
      res.writeHead(400);
      return res.end('invalid JSON');
    }
  }

  // Default: /call — the actual "make a request to the dependency" path.
  // Every request pays the configured latency, and fails at the configured rate.
  requestCount++;
  const delay = Math.max(0, config.latencyMs + (Math.random() * 2 - 1) * config.jitterMs);
  const start = Date.now();
  await sleep(delay);
  recordLatency(Date.now() - start);

  if (Math.random() < config.failureRate) {
    failureCount++;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'dep-sim: simulated failure' }));
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, latencyMs: Math.round(Date.now() - start) }));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`dep-sim listening on :${PORT}`));
