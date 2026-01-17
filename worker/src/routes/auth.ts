import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { generateToken, generateId } from '../utils/crypto';
import type { AppEnv } from '../index';

const auth = new Hono<AppEnv>();

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
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, type, expires_at)
    VALUES (?, ?, ?, 'magic_link', ?)
  `).bind(generateId(), user!.id, token, expiresAt.toISOString()).run();

  // Build magic link URL
  const magicLinkUrl = `${c.env.APP_URL}/api/auth/verify?token=${token}`;

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

  // Find valid magic link token
  const authToken = await c.env.DB.prepare(`
    SELECT * FROM auth_tokens
    WHERE token = ?
      AND type = 'magic_link'
      AND expires_at > datetime('now')
      AND used_at IS NULL
  `).bind(token).first();

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

  // Create session token (expires in 7 days)
  const sessionToken = generateToken(32);
  const sessionExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, type, expires_at)
    VALUES (?, ?, ?, 'session', ?)
  `).bind(generateId(), authToken.user_id, sessionToken, sessionExpires.toISOString()).run();

  // Update user's last login
  await c.env.DB.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(authToken.user_id).run();

  // If returnToken mode, return the session token as JSON (for frontend to set cookie)
  if (returnToken) {
    return c.json({ sessionToken, success: true });
  }

  // Legacy mode: Set cookie and redirect (for direct API access)
  setCookie(c, 'session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
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

export default auth;
