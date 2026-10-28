/* ============================================================
   In-memory rate limiter (token bucket per key)
   ============================================================ */

interface Bucket {
  tokens: number;
  last: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.last > 600_000) buckets.delete(k);
  }
}

/**
 * Returns true if the request is allowed.
 * @param key unique key (e.g. ip + route)
 * @param capacity max burst
 * @param refillPerSec tokens refilled per second
 */
export function rateLimit(
  key: string,
  capacity = 30,
  refillPerSec = 0.5
): boolean {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, last: now };
    buckets.set(key, b);
  }
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
