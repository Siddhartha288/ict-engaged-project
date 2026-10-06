/**
 * In-memory brute-force protection for credential checks.
 *
 * Two independent counters of *failed* attempts, so neither alone can be
 * dodged: one per account (stops guessing a password from many IPs) and one
 * per client IP (stops one machine spraying many accounts). A success clears
 * the account counter. State is per-process and resets on restart, which is
 * acceptable for a single-instance deployment.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 30;

function createCounter({ max, windowMs }) {
  const entries = new Map(); // key -> { count, resetAt }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  }, 60 * 1000);
  sweep.unref(); // never keep the process alive just for housekeeping

  return {
    retryAfterMs(key) {
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= Date.now()) return 0;
      return entry.count >= max ? entry.resetAt - Date.now() : 0;
    },
    fail(key) {
      const now = Date.now();
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now) entries.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count += 1;
    },
    reset(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
  };
}

const byEmail = createCounter({ max: MAX_PER_EMAIL, windowMs: WINDOW_MS });
const byIp = createCounter({ max: MAX_PER_IP, windowMs: WINDOW_MS });

const loginGuard = {
  /** Returns how many seconds the caller must wait, or 0 if allowed. */
  check(email, ip) {
    const ms = Math.max(byEmail.retryAfterMs(email), byIp.retryAfterMs(ip));
    return Math.ceil(ms / 1000);
  },
  fail(email, ip) {
    byEmail.fail(email);
    byIp.fail(ip);
  },
  succeed(email) {
    byEmail.reset(email);
  },
  clearAll() {
    byEmail.clear();
    byIp.clear();
  },
};

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function tooManyMessage(seconds) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many failed attempts. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

module.exports = { loginGuard, clientIp, tooManyMessage, MAX_PER_EMAIL, MAX_PER_IP };
