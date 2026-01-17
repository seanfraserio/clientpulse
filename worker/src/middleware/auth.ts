import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { TenantDB } from '../db/tenant-db';
import { sha256 } from '../utils/crypto';
import type { User } from '@shared/types';
import type { AppEnv } from '../index';

// Session renewal constants
const SESSION_RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 1 day
const SESSION_EXTENSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Authentication middleware
 * Validates session from Authorization header or cookie and injects user + tenant-aware DB into context
 * Supports both hashed and plain tokens for backward compatibility during migration
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

  // Hash the token for lookup
  const tokenHash = await sha256(sessionToken);

  // Validate session by hash first (new method), with fallback to plain token
  // Also check absolute_expires_at if it exists (sessions created after migration)
  let result = await c.env.DB.prepare(`
    SELECT u.*
    FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token_hash = ?
      AND t.type = 'session'
      AND t.expires_at > datetime('now')
      AND (t.absolute_expires_at IS NULL OR t.absolute_expires_at > datetime('now'))
      AND t.used_at IS NULL
      AND u.status = 'active'
  `).bind(tokenHash).first<User>();

  // Fallback to plain token lookup for backward compatibility
  if (!result) {
    result = await c.env.DB.prepare(`
      SELECT u.*
      FROM users u
      JOIN auth_tokens t ON t.user_id = u.id
      WHERE t.token = ?
        AND t.type = 'session'
        AND t.expires_at > datetime('now')
        AND (t.absolute_expires_at IS NULL OR t.absolute_expires_at > datetime('now'))
        AND t.used_at IS NULL
        AND u.status = 'active'
    `).bind(sessionToken).first<User>();
  }

  if (!result) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or expired session' }, 401);
  }

  // Check if session needs renewal (if < 1 day left)
  // Only extend if absolute timeout hasn't been reached
  const session = await c.env.DB.prepare(`
    SELECT expires_at, absolute_expires_at FROM auth_tokens
    WHERE (token_hash = ? OR token = ?) AND type = 'session'
  `).bind(tokenHash, sessionToken).first<{ expires_at: string; absolute_expires_at: string | null }>();

  if (session) {
    const expiresAt = new Date(session.expires_at);
    const renewThreshold = Date.now() + SESSION_RENEWAL_THRESHOLD_MS;

    if (expiresAt.getTime() < renewThreshold) {
      // Calculate new expiry, capped at absolute timeout
      let newExpiry = new Date(Date.now() + SESSION_EXTENSION_MS);

      if (session.absolute_expires_at) {
        const absoluteExpiry = new Date(session.absolute_expires_at);
        if (newExpiry > absoluteExpiry) {
          newExpiry = absoluteExpiry;
        }
      }

      // Only extend if new expiry is after current expiry
      if (newExpiry > expiresAt) {
        await c.env.DB.prepare(`
          UPDATE auth_tokens
          SET expires_at = ?
          WHERE (token_hash = ? OR token = ?)
        `).bind(newExpiry.toISOString(), tokenHash, sessionToken).run();
      }
    }
  }

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
    const tokenHash = await sha256(sessionToken);

    // Try hash lookup first, then fallback to plain token
    let result = await c.env.DB.prepare(`
      SELECT u.*
      FROM users u
      JOIN auth_tokens t ON t.user_id = u.id
      WHERE t.token_hash = ?
        AND t.type = 'session'
        AND t.expires_at > datetime('now')
        AND (t.absolute_expires_at IS NULL OR t.absolute_expires_at > datetime('now'))
        AND t.used_at IS NULL
        AND u.status = 'active'
    `).bind(tokenHash).first<User>();

    if (!result) {
      result = await c.env.DB.prepare(`
        SELECT u.*
        FROM users u
        JOIN auth_tokens t ON t.user_id = u.id
        WHERE t.token = ?
          AND t.type = 'session'
          AND t.expires_at > datetime('now')
          AND (t.absolute_expires_at IS NULL OR t.absolute_expires_at > datetime('now'))
          AND t.used_at IS NULL
          AND u.status = 'active'
      `).bind(sessionToken).first<User>();
    }

    if (result) {
      c.set('user', result);
      c.set('db', new TenantDB(c.env.DB, result.id));
    }
  }

  await next();
}
