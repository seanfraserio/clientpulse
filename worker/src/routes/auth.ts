import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { generateToken, generateId, sha256 } from '../utils/crypto';
import { isValidHttpsUrl } from '../utils/validation';
import type { AppEnv } from '../index';

const auth = new Hono<AppEnv>();

// Absolute session timeout (30 days) - cannot be extended
const ABSOLUTE_SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
// Sliding session timeout (7 days) - can be extended up to absolute timeout
const SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const MagicLinkSchema = z.object({
  email: z.string().email().toLowerCase().max(255)
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/magic-link - Request magic link
// ═══════════════════════════════════════════════════════════

auth.post('/magic-link', async (c) => {
  const body = await c.req.json();

  // Validate input
  const parsed = MagicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Invalid email',
      details: parsed.error.errors
    }, 400);
  }

  const { email } = parsed.data;

  // Per-email rate limiting (3 requests per hour per email address)
  // This is in addition to IP-based rate limiting in middleware
  const emailRateKey = `magic_email:${email}`;
  const emailRateData = await c.env.CACHE.get(emailRateKey, 'json') as { count: number; resetAt: number } | null;
  const now = Date.now();
  const hourWindow = 60 * 60 * 1000;

  if (emailRateData && emailRateData.resetAt > now) {
    if (emailRateData.count >= 3) {
      // Don't reveal whether email exists - return same success message
      // but don't actually send another email
      console.log(`[Auth] Per-email rate limit exceeded for ${email}`);
      return c.json({
        message: 'If an account exists with that email, we sent a sign-in link.'
      });
    }
    // Increment count
    await c.env.CACHE.put(emailRateKey, JSON.stringify({
      count: emailRateData.count + 1,
      resetAt: emailRateData.resetAt
    }), { expirationTtl: Math.ceil((emailRateData.resetAt - now) / 1000) });
  } else {
    // Start new window
    await c.env.CACHE.put(emailRateKey, JSON.stringify({
      count: 1,
      resetAt: now + hourWindow
    }), { expirationTtl: 3660 }); // hour + 1 minute buffer
  }

  // Find or create user
  let user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) {
    // Create new user
    const userId = generateId();
    await c.env.DB.prepare(`
      INSERT INTO users (id, email) VALUES (?, ?)
    `).bind(userId, email).run();

    user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(userId).first();
  }

  // Generate magic link token (expires in 15 minutes)
  const token = generateToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, token_hash, type, expires_at)
    VALUES (?, ?, ?, ?, 'magic_link', ?)
  `).bind(generateId(), user!.id, token, tokenHash, expiresAt.toISOString()).run();

  // Validate APP_URL before using in email links to prevent phishing
  // In dev, allow localhost; in production require HTTPS
  const appUrl = c.env.APP_URL;
  const isValidUrl = c.env.ENVIRONMENT === 'development'
    ? appUrl.startsWith('http://localhost') || isValidHttpsUrl(appUrl)
    : isValidHttpsUrl(appUrl);

  if (!isValidUrl) {
    console.error('[Auth] Invalid APP_URL configuration:', appUrl);
    return c.json({ error: 'Configuration error' }, 500);
  }

  // Build magic link URL
  const magicLinkUrl = `${appUrl}/api/auth/verify?token=${token}`;

  // In development, log the link
  if (c.env.ENVIRONMENT === 'development') {
    console.log('='.repeat(60));
    console.log('MAGIC LINK (dev mode):');
    console.log(magicLinkUrl);
    console.log('='.repeat(60));
  }

  // Send email via Resend
  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: c.env.FROM_EMAIL,
        to: email,
        subject: 'Sign in to ClientPulse',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ea5e9;">Sign in to ClientPulse</h2>
            <p>Click the button below to sign in to your account. This link expires in 15 minutes.</p>
            <a href="${magicLinkUrl}"
               style="display: inline-block; background: #0ea5e9; color: white;
                      padding: 12px 24px; text-decoration: none; border-radius: 6px;
                      margin: 16px 0;">
              Sign In
            </a>
            <p style="color: #666; font-size: 14px;">
              If you didn't request this email, you can safely ignore it.
            </p>
            <p style="color: #999; font-size: 12px;">
              Or copy this link: ${magicLinkUrl}
            </p>
          </div>
        `
      })
    });

    if (!emailResponse.ok) {
      console.error('Failed to send email:', await emailResponse.text());
      // Don't expose email sending failures to prevent email enumeration
    }
  } catch (error) {
    console.error('Email service error:', error);
    // Continue anyway - in dev mode we logged the link
  }

  return c.json({
    message: 'If an account exists with that email, we sent a sign-in link.'
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/auth/verify - Verify magic link and create session
// ═══════════════════════════════════════════════════════════

auth.get('/verify', async (c) => {
  const token = c.req.query('token');
  const returnToken = c.req.query('returnToken') === 'true';

  if (!token) {
    if (returnToken) {
      return c.json({ error: 'Missing token' }, 400);
    }
    return c.redirect(`${c.env.APP_URL}/login?error=missing_token`);
  }

  // Hash the incoming token to look up in database
  const tokenHash = await sha256(token);

  // Find valid magic link token by hash (with fallback to plain token for migration)
  let authToken = await c.env.DB.prepare(`
    SELECT * FROM auth_tokens
    WHERE token_hash = ?
      AND type = 'magic_link'
      AND expires_at > datetime('now')
      AND used_at IS NULL
  `).bind(tokenHash).first();

  // Fallback for tokens created before migration
  if (!authToken) {
    authToken = await c.env.DB.prepare(`
      SELECT * FROM auth_tokens
      WHERE token = ?
        AND type = 'magic_link'
        AND expires_at > datetime('now')
        AND used_at IS NULL
    `).bind(token).first();
  }

  if (!authToken) {
    if (returnToken) {
      return c.json({ error: 'Invalid or expired token' }, 400);
    }
    return c.redirect(`${c.env.APP_URL}/login?error=invalid_token`);
  }

  // Mark magic link as used
  await c.env.DB.prepare(`
    UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(authToken.id).run();

  // Create session token with absolute timeout
  const sessionToken = generateToken(32);
  const sessionTokenHash = await sha256(sessionToken);
  const sessionExpires = new Date(Date.now() + SESSION_TIMEOUT_MS);
  const absoluteExpires = new Date(Date.now() + ABSOLUTE_SESSION_TIMEOUT_MS);

  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, token_hash, type, expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, 'session', ?, ?)
  `).bind(
    generateId(),
    authToken.user_id,
    sessionToken, // Keep plain token temporarily for backward compatibility during migration
    sessionTokenHash,
    sessionExpires.toISOString(),
    absoluteExpires.toISOString()
  ).run();

  // Update user's last login
  await c.env.DB.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(authToken.user_id).run();

  // If returnToken mode, return the session token as JSON (for frontend to set cookie)
  if (returnToken) {
    return c.json({ sessionToken, success: true });
  }

  // Set secure cookie with proper SameSite setting
  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax', // Changed from 'None' for CSRF protection
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });

  return c.redirect(`${c.env.APP_URL}/dashboard`);
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/logout - Clear session
// ═══════════════════════════════════════════════════════════

auth.post('/logout', async (c) => {
  const sessionToken = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];

  if (sessionToken) {
    // Invalidate session in database
    await c.env.DB.prepare(`
      UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE token = ? AND type = 'session'
    `).bind(sessionToken).run();
  }

  // Clear cookie
  deleteCookie(c, 'session', {
    path: '/'
  });

  return c.json({ message: 'Logged out' });
});

// ═══════════════════════════════════════════════════════════
// GET /api/auth/me - Get current user
// ═══════════════════════════════════════════════════════════

auth.get('/me', async (c) => {
  // Check Authorization header first, then fall back to cookie
  const authHeader = c.req.header('Authorization');
  let sessionToken: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    sessionToken = authHeader.slice(7);
  } else {
    sessionToken = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1];
  }

  if (!sessionToken) {
    return c.json({ user: null });
  }

  const user = await c.env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.avatar_url, u.timezone, u.plan, u.plan_period,
           u.daily_digest_enabled, u.clients_count, u.notes_count, u.created_at
    FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ?
      AND t.type = 'session'
      AND t.expires_at > datetime('now')
      AND t.used_at IS NULL
      AND u.status = 'active'
  `).bind(sessionToken).first();

  return c.json({ user: user || null });
});

// ═══════════════════════════════════════════════════════════
// POST /api/auth/exchange - Exchange one-time code for session
// Used by OAuth flow to avoid session token in URL
// ═══════════════════════════════════════════════════════════

auth.post('/exchange', async (c) => {
  const body = await c.req.json();
  const code = body.code;

  if (!code || typeof code !== 'string') {
    return c.json({ error: 'Missing code' }, 400);
  }

  // Find and validate exchange code
  const exchangeRecord = await c.env.DB.prepare(`
    SELECT * FROM exchange_codes
    WHERE code = ?
      AND expires_at > datetime('now')
      AND used_at IS NULL
  `).bind(code).first();

  if (!exchangeRecord) {
    return c.json({ error: 'Invalid or expired code' }, 400);
  }

  // Mark code as used
  await c.env.DB.prepare(`
    UPDATE exchange_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(exchangeRecord.id).run();

  // Find the session by its hash
  const session = await c.env.DB.prepare(`
    SELECT token FROM auth_tokens
    WHERE token_hash = ?
      AND type = 'session'
      AND expires_at > datetime('now')
      AND used_at IS NULL
  `).bind(exchangeRecord.session_token_hash).first<{ token: string }>();

  if (!session) {
    return c.json({ error: 'Session expired' }, 400);
  }

  return c.json({ sessionToken: session.token, success: true });
});

export default auth;
