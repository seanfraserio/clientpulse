import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { TenantDB } from '../db/tenant-db';
import type { User } from '@shared/types';
import type { AppEnv } from '../index';

/**
 * Authentication middleware
 * Validates session from Authorization header or cookie and injects user + tenant-aware DB into context
 */
export async function authMiddleware(c: Context<AppEnv>, next: Next) {
  // Check Authorization header first, then fall back to cookie
  const authHeader = c.req.header('Authorization');
  let sessionToken: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    sessionToken = authHeader.slice(7);
  } else {
    sessionToken = getCookie(c, 'session');
  }

  if (!sessionToken) {
    return c.json({ error: 'Unauthorized', message: 'No session token' }, 401);
  }

  // Validate session and get user
  const result = await c.env.DB.prepare(`
    SELECT u.*
    FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ?
      AND t.type = 'session'
      AND t.expires_at > datetime('now')
      AND t.used_at IS NULL
      AND u.status = 'active'
  `).bind(sessionToken).first<User>();

  if (!result) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired session' }, 401);
  }

  // Check if session needs renewal (if < 1 day left)
  const session = await c.env.DB.prepare(`
    SELECT expires_at FROM auth_tokens
    WHERE token = ? AND type = 'session'
  `).bind(sessionToken).first<{ expires_at: string }>();

  if (session) {
    const expiresAt = new Date(session.expires_at);
    const renewThreshold = Date.now() + (24 * 60 * 60 * 1000); // 1 day

    if (expiresAt.getTime() < renewThreshold) {
      // Extend session by 7 days
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await c.env.DB.prepare(`
        UPDATE auth_tokens
        SET expires_at = ?
        WHERE token = ?
      `).bind(newExpiry.toISOString(), sessionToken).run();
    }
  }

  // Update last login
  await c.env.DB.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(result.id).run();

  // Inject user and tenant-aware DB into context
  c.set('user', result);
  c.set('db', new TenantDB(c.env.DB, result.id));

  await next();
}

/**
 * Optional auth middleware - doesn't fail if no session
 * Useful for endpoints that work differently for logged-in vs anonymous users
 */
export async function optionalAuthMiddleware(c: Context<AppEnv>, next: Next) {
  // Check Authorization header first, then fall back to cookie
  const authHeader = c.req.header('Authorization');
  let sessionToken: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    sessionToken = authHeader.slice(7);
  } else {
    sessionToken = getCookie(c, 'session');
  }

  if (sessionToken) {
    const result = await c.env.DB.prepare(`
      SELECT u.*
      FROM users u
      JOIN auth_tokens t ON t.user_id = u.id
      WHERE t.token = ?
        AND t.type = 'session'
        AND t.expires_at > datetime('now')
        AND t.used_at IS NULL
        AND u.status = 'active'
    `).bind(sessionToken).first<User>();

    if (result) {
      c.set('user', result);
      c.set('db', new TenantDB(c.env.DB, result.id));
    }
  }

  await next();
}
