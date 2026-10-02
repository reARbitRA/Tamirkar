/**
 * Fixed-window rate limiter, in-process.
 *
 * Scope note: state lives in one Node process, so the effective ceiling on Render is
 * (limit x instance count). That is deliberate — it stops a single caller from burning the
 * Gemini spend cap or the SMS daily quota on one instance, which is the abuse that has
 * actually happened. A global ceiling needs Redis and is tracked as F-SEC-004's residual.
 */

/**
 * @param {{limit:number, windowMs:number, now?:()=>number}} options
 */
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const buckets = new Map();
  return {
    get size() { return buckets.size; },
    /**
     * @param {string} key bucket key — normally the authenticated user id
     * @returns {{allowed:boolean, remaining:number, retryAfterSeconds:number, limit:number}}
     */
    take(key) {
      const stamp = now();
      const bucket = buckets.get(key);
      if (!bucket || stamp - bucket.startedAt >= windowMs) {
        buckets.set(key, { startedAt: stamp, count: 1 });
        return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, limit };
      }
      bucket.count += 1;
      if (bucket.count <= limit) {
        return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0, limit };
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - stamp) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds, limit };
    },
    /** Drop expired buckets. Called on a timer so an idle service does not grow the map forever. */
    sweep() {
      const stamp = now();
      for (const [key, bucket] of buckets) {
        if (stamp - bucket.startedAt >= windowMs) buckets.delete(key);
      }
      return buckets.size;
    },
    reset(key) {
      if (key === undefined) buckets.clear();
      else buckets.delete(key);
    }
  };
}
