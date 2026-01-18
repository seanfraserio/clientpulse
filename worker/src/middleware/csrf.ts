import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../index';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a cryptographically secure random token
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(CSRF_TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * CSRF protection middleware using double-submit cookie pattern
 *
 * How it works:
 * 1. On any request, if no CSRF cookie exists, set one
 * 2. On state-changing requests (POST, PUT, PATCH, DELETE), require
 *    the X-CSRF-Token header to match the cookie value
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

  // Get existing CSRF token from cookie
  let csrfToken = getCookie(c, CSRF_COOKIE_NAME);

  // Generate new token if none exists
  if (!csrfToken) {
    csrfToken = generateCsrfToken();

    // Set CSRF cookie with secure attributes
    const isProduction = c.env.ENVIRONMENT === 'production';
    setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,  // Must be readable by JavaScript
      secure: isProduction,
      sameSite: 'Strict',
      path: '/',
      maxAge: 24 * 60 * 60  // 24 hours
    });
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
