interface RateRecord {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateRecord>();

// Periodically clean up expired entries
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
      if (now > value.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Basic rate limiting helper (in-memory counter per IP).
 * Defaults to 60 requests per 10 minutes.
 * Returns true if request is allowed, false if limit is exceeded.
 */
export function checkRateLimit(
  ip: string,
  maxRequests: number = 60,
  windowMs: number = 10 * 60 * 1000
): boolean {
  const now = Date.now();
  const current = store.get(ip);

  if (!current || now > current.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= maxRequests) {
    return false;
  }

  current.count++;
  return true;
}

/**
 * Extracts client IP safely from request headers.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') || '127.0.0.1';
}
