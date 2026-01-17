import { Context, Next } from 'hono';
import type { AppEnv } from '../index';

interface RateLimitConfig {
  requests: number;
  windowSeconds: number;
  keyGenerator: (c: Context<AppEnv>) => string;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Authentication endpoints - strict limits
  'POST:/api/auth/magic-link': {
    requests: 5,
    windowSeconds: 3600,  // 5 per hour per email/IP
    keyGenerator: (c) => `magic:${c.req.header('CF-Connecting-IP') || 'unknown'}`
  },
  'GET:/api/auth/verify': {
    requests: 10,
    windowSeconds: 300,  // 10 per 5 minutes - prevent brute force
    keyGenerator: (c) => `verify:${c.req.header('CF-Connecting-IP') || 'unknown'}`
  },

  // Search - expensive operation
  'POST:/api/search': {
    requests: 100,
    windowSeconds: 3600,
    keyGenerator: (c) => `search:${c.get('user')?.id || c.req.header('CF-Connecting-IP')}`
  },

  // AI briefing generation - expensive
  'POST:/api/clients/*/briefing': {
    requests: 20,
    windowSeconds: 3600,
    keyGenerator: (c) => `briefing:${c.get('user')?.id || c.req.header('CF-Connecting-IP')}`
  },

  // Billing endpoints - sensitive
  'POST:/api/billing/checkout': {
    requests: 10,
    windowSeconds: 3600,
    keyGenerator: (c) => `checkout:${c.get('user')?.id || c.req.header('CF-Connecting-IP')}`
  }
};

// Default limit for all other authenticated endpoints
const DEFAULT_LIMIT: RateLimitConfig = {
  requests: 1000,
  windowSeconds: 3600,
  keyGenerator: (c) => `api:${c.get('user')?.id || c.req.header('CF-Connecting-IP') || 'unknown'}`
};

/**
 * Rate limiting middleware using Cloudflare KV
 */
export async function rateLimitMiddleware(c: Context<AppEnv>, next: Next) {
  // Skip rate limiting for OPTIONS requests (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  const path = c.req.path;
  const method = c.req.method;
  const key = `${method}:${path}`;

  // Find matching rate limit config
  let config = RATE_LIMITS[key];

  // Check for wildcard matches (e.g., POST:/api/clients/*/briefing)
  if (!config) {
    for (const [pattern, cfg] of Object.entries(RATE_LIMITS)) {
      const regex = new RegExp('^' + pattern.replace('*', '[^/]+') + '$');
      if (regex.test(key)) {
        config = cfg;
        break;
      }
    }
  }

  // Use default if no specific config found
  config = config || DEFAULT_LIMIT;

  const rateLimitKey = config.keyGenerator(c);
  const result = await checkRateLimit(
    c.env.CACHE,
    rateLimitKey,
    config.requests,
    config.windowSeconds
  );

  // Set rate limit headers
  c.header('X-RateLimit-Limit', config.requests.toString());
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.resetAt.toString());

  if (!result.allowed) {
    c.header('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000).toString());
    return c.json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
    }, 429);
  }

  await next();
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
  const resetAt = windowStart + (windowSeconds * 1000);

  const kvKey = `ratelimit:${key}:${windowStart}`;

  const current = await kv.get(kvKey, 'json') as { count: number } | null;
  const count = current?.count || 0;

  if (count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt
    };
  }

  // Increment counter
  await kv.put(kvKey, JSON.stringify({ count: count + 1 }), {
    expirationTtl: windowSeconds + 60 // Add buffer for clock drift
  });

  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt
  };
}
