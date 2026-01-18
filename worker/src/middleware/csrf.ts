import { Context, Next } from 'hono';
import type { AppEnv } from '../index';

const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Generate a cryptographically secure random token
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * CSRF protection middleware using session-bound tokens
 *
 * How it works (cross-origin compatible):
 * 1. Extract session token from Authorization header
 * 2. Use session token to look up/store CSRF token in KV cache
 * 3. On state-changing requests, validate the header token against cached token
 * 4. Return CSRF token in response header for client to store in localStorage
 *
 * Exempt endpoints:
 * - Webhook endpoints (use signature verification instead)
 * - OAuth callback endpoints (state parameter provides CSRF protection)
 * - OPTIONS requests (CORS preflight)
 */
export async function csrfMiddleware(c: Context<AppEnv>, next: Next) {
  // Skip CSRF for OPTIONS requests (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    await next();
    return;
  }

  // Skip CSRF for webhook endpoints (they use signature verification)
  const path = c.req.path;
  if (path.startsWith('/api/webhooks')) {
    await next();
    return;
  }

  // Skip CSRF for OAuth callbacks (they use state parameter for CSRF protection)
  if (path.includes('/oauth/') && path.includes('/callback')) {
    await next();
    return;
  }

  // Get session token from Authorization header to use as CSRF key
  const authHeader = c.req.header('Authorization');
  const sessionToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!sessionToken) {
    // No session token means unauthenticated request - skip CSRF
    // (auth middleware will handle rejecting if needed)
    await next();
    return;
  }

  // Create a hash of the session token for the KV key (don't store raw tokens)
  const encoder = new TextEncoder();
  const data = encoder.encode(sessionToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sessionHash = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  const csrfKey = `csrf:${sessionHash}`;

  // Get existing CSRF token from KV cache
  let csrfToken = await c.env.CACHE.get(csrfKey);

  // Generate new token if none exists
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    await c.env.CACHE.put(csrfKey, csrfToken, { expirationTtl: CSRF_TOKEN_TTL });
  }

  // For state-changing methods, validate CSRF token
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (stateChangingMethods.includes(c.req.method)) {
    const headerToken = c.req.header(CSRF_HEADER_NAME);

    if (!headerToken) {
      return c.json({
        error: 'CSRF token missing',
        message: 'Include the X-CSRF-Token header with your request'
      }, 403);
    }

    // Constant-time comparison to prevent timing attacks
    if (!timingSafeEqual(csrfToken, headerToken)) {
      return c.json({
        error: 'CSRF token invalid',
        message: 'CSRF token does not match'
      }, 403);
    }
  }

  // Expose CSRF token in response header for clients to read
  c.header('X-CSRF-Token', csrfToken);

  await next();
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
