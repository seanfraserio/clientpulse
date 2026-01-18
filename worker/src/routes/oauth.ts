import { Hono } from 'hono';
import { generateToken, generateId, sha256 } from '../utils/crypto';
import { auditAuthSuccess } from '../services/audit';
import type { AppEnv } from '../index';
import type { OAuthProvider } from '@shared/types';

const oauth = new Hono<AppEnv>();

// Session timeouts (must match auth.ts)
const ABSOLUTE_SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════
// OAuth Configuration
// ═══════════════════════════════════════════════════════════

const OAUTH_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scopes: ['read:user', 'user:email'],
  },
};

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

async function createOAuthState(
  db: D1Database,
  provider: OAuthProvider,
  redirectUri?: string
): Promise<string> {
  const state = generateToken(32);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.prepare(`
    INSERT INTO oauth_states (id, state, provider, redirect_uri, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(generateId(), state, provider, redirectUri || null, expiresAt.toISOString()).run();

  return state;
}

async function validateOAuthState(
  db: D1Database,
  state: string,
  provider: OAuthProvider
): Promise<boolean> {
  const result = await db.prepare(`
    SELECT * FROM oauth_states
    WHERE state = ?
      AND provider = ?
      AND expires_at > datetime('now')
  `).bind(state, provider).first();

  if (result) {
    // Delete used state
    await db.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
    return true;
  }

  return false;
}

async function findOrCreateUser(
  db: D1Database,
  provider: OAuthProvider,
  providerUserId: string,
  email: string,
  name: string | null,
  avatarUrl: string | null
): Promise<{ userId: string; isNew: boolean }> {
  // First, check if we have an OAuth account for this provider + provider_user_id
  const existingOAuth = await db.prepare(`
    SELECT user_id FROM oauth_accounts
    WHERE provider = ? AND provider_user_id = ?
  `).bind(provider, providerUserId).first<{ user_id: string }>();

  if (existingOAuth) {
    // Update the OAuth account with latest info
    await db.prepare(`
      UPDATE oauth_accounts
      SET provider_email = ?, provider_name = ?, provider_avatar_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE provider = ? AND provider_user_id = ?
    `).bind(email, name, avatarUrl, provider, providerUserId).run();

    // Update user's avatar if they don't have one
    await db.prepare(`
      UPDATE users SET avatar_url = COALESCE(avatar_url, ?), name = COALESCE(name, ?)
      WHERE id = ?
    `).bind(avatarUrl, name, existingOAuth.user_id).run();

    return { userId: existingOAuth.user_id, isNew: false };
  }

  // Check if user exists with this email
  const existingUser = await db.prepare(`
    SELECT id FROM users WHERE email = ?
  `).bind(email).first<{ id: string }>();

  let userId: string;
  let isNew = false;

  if (existingUser) {
    userId = existingUser.id;
    // Update user's avatar and name if not set
    await db.prepare(`
      UPDATE users SET avatar_url = COALESCE(avatar_url, ?), name = COALESCE(name, ?)
      WHERE id = ?
    `).bind(avatarUrl, name, userId).run();
  } else {
    // Create new user
    userId = generateId();
    await db.prepare(`
      INSERT INTO users (id, email, name, avatar_url)
      VALUES (?, ?, ?, ?)
    `).bind(userId, email, name, avatarUrl).run();
    isNew = true;
  }

  // Create OAuth account link
  await db.prepare(`
    INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_name, provider_avatar_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(generateId(), userId, provider, providerUserId, email, name, avatarUrl).run();

  return { userId, isNew };
}

async function createSessionAndRedirect(
  c: any,
  userId: string
): Promise<Response> {
  // Create session token with hash for secure storage
  const sessionToken = generateToken(32);
  const sessionTokenHash = await sha256(sessionToken);
  const sessionExpires = new Date(Date.now() + SESSION_TIMEOUT_MS);
  const absoluteExpires = new Date(Date.now() + ABSOLUTE_SESSION_TIMEOUT_MS);

  await c.env.DB.prepare(`
    INSERT INTO auth_tokens (id, user_id, token, token_hash, type, expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, 'session', ?, ?)
  `).bind(
    generateId(),
    userId,
    sessionToken,
    sessionTokenHash,
    sessionExpires.toISOString(),
    absoluteExpires.toISOString()
  ).run();

  // Update last login
  await c.env.DB.prepare(`
    UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(userId).run();

  // Create one-time exchange code (expires in 5 minutes)
  // This prevents session token from appearing in URL
  // Hash the code for secure storage
  const exchangeCode = generateToken(16);
  const exchangeCodeHash = await sha256(exchangeCode);
  const exchangeExpires = new Date(Date.now() + 5 * 60 * 1000);

  await c.env.DB.prepare(`
    INSERT INTO exchange_codes (id, code, code_hash, session_token_hash, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(generateId(), exchangeCode, exchangeCodeHash, sessionTokenHash, exchangeExpires.toISOString()).run();

  // Redirect to frontend verify page with exchange code (not session token!)
  return c.redirect(`${c.env.APP_URL}/auth/verify?code=${exchangeCode}`);
}

// ═══════════════════════════════════════════════════════════
// Google OAuth
// ═══════════════════════════════════════════════════════════

oauth.get('/google', async (c) => {
  const state = await createOAuthState(c.env.DB, 'google');
  const redirectUri = `${c.env.API_URL}/api/auth/oauth/google/callback`;

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_CONFIG.google.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return c.redirect(`${OAUTH_CONFIG.google.authUrl}?${params.toString()}`);
});

oauth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    console.error('Google OAuth error:', error);
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_denied`);
  }

  if (!code || !state) {
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_invalid`);
  }

  // Validate state
  const validState = await validateOAuthState(c.env.DB, state, 'google');
  if (!validState) {
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_state_invalid`);
  }

  try {
    // Exchange code for token
    const redirectUri = `${c.env.API_URL}/api/auth/oauth/google/callback`;
    const tokenResponse = await fetch(OAUTH_CONFIG.google.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Google token error:', await tokenResponse.text());
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_token_failed`);
    }

    const tokenData = await tokenResponse.json<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>();

    // Get user info
    const userResponse = await fetch(OAUTH_CONFIG.google.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) {
      console.error('Google user info error:', await userResponse.text());
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_user_failed`);
    }

    const userData = await userResponse.json<{
      id: string;
      email: string;
      name?: string;
      picture?: string;
    }>();

    if (!userData.email) {
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_no_email`);
    }

    // Find or create user
    const { userId } = await findOrCreateUser(
      c.env.DB,
      'google',
      userData.id,
      userData.email,
      userData.name || null,
      userData.picture || null
    );

    // Audit log the successful OAuth login
    await auditAuthSuccess(c.env.DB, userId, 'oauth_google', c);

    return createSessionAndRedirect(c, userId);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_failed`);
  }
});

// ═══════════════════════════════════════════════════════════
// GitHub OAuth
// ═══════════════════════════════════════════════════════════

oauth.get('/github', async (c) => {
  const state = await createOAuthState(c.env.DB, 'github');
  const redirectUri = `${c.env.API_URL}/api/auth/oauth/github/callback`;

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_CP_ID,
    redirect_uri: redirectUri,
    scope: OAUTH_CONFIG.github.scopes.join(' '),
    state,
  });

  return c.redirect(`${OAUTH_CONFIG.github.authUrl}?${params.toString()}`);
});

oauth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    console.error('GitHub OAuth error:', error);
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_denied`);
  }

  if (!code || !state) {
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_invalid`);
  }

  // Validate state
  const validState = await validateOAuthState(c.env.DB, state, 'github');
  if (!validState) {
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_state_invalid`);
  }

  try {
    // Exchange code for token
    const redirectUri = `${c.env.API_URL}/api/auth/oauth/github/callback`;
    const tokenResponse = await fetch(OAUTH_CONFIG.github.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: c.env.GITHUB_CLIENT_CP_ID,
        client_secret: c.env.GITHUB_CLIENT_CP_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error('GitHub token error:', await tokenResponse.text());
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_token_failed`);
    }

    const tokenData = await tokenResponse.json<{
      access_token: string;
      token_type: string;
      scope: string;
      error?: string;
    }>();

    if (tokenData.error) {
      console.error('GitHub token error:', tokenData.error);
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_token_failed`);
    }

    // Get user info
    const userResponse = await fetch(OAUTH_CONFIG.github.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ClientPulse',
      },
    });

    if (!userResponse.ok) {
      console.error('GitHub user info error:', await userResponse.text());
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_user_failed`);
    }

    const userData = await userResponse.json<{
      id: number;
      email: string | null;
      name: string | null;
      login: string;
      avatar_url: string;
    }>();

    // GitHub email might be null if private, need to fetch emails
    let email = userData.email;
    if (!email) {
      const emailsResponse = await fetch(OAUTH_CONFIG.github.emailsUrl, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ClientPulse',
        },
      });

      if (emailsResponse.ok) {
        const emails = await emailsResponse.json<Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>>();

        // Find primary verified email
        const primaryEmail = emails.find((e) => e.primary && e.verified);
        if (primaryEmail) {
          email = primaryEmail.email;
        } else {
          // Fall back to any verified email
          const verifiedEmail = emails.find((e) => e.verified);
          if (verifiedEmail) {
            email = verifiedEmail.email;
          }
        }
      }
    }

    if (!email) {
      return c.redirect(`${c.env.APP_URL}/login?error=oauth_no_email`);
    }

    // Find or create user
    const { userId } = await findOrCreateUser(
      c.env.DB,
      'github',
      userData.id.toString(),
      email,
      userData.name || userData.login,
      userData.avatar_url
    );

    // Audit log the successful OAuth login
    await auditAuthSuccess(c.env.DB, userId, 'oauth_github', c);

    return createSessionAndRedirect(c, userId);
  } catch (err) {
    console.error('GitHub OAuth callback error:', err);
    return c.redirect(`${c.env.APP_URL}/login?error=oauth_failed`);
  }
});

export default oauth;
