const buckets = new Map();

function nowMs() {
  return Date.now();
}

// Very small in-memory rate limiter (good for dev / single instance)
// Usage: rateLimit({ windowMs: 60_000, max: 20 })
function rateLimit({ windowMs, max }) {
  if (!windowMs || !max) throw new Error('rateLimit requires windowMs and max');

  return (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = nowMs();

    const prev = buckets.get(key);
    if (!prev || now - prev.start > windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return next();
    }

    prev.count += 1;
    if (prev.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - prev.start)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message: 'Too many requests, please try again later' });
    }

    return next();
  };
}

module.exports = rateLimit;

