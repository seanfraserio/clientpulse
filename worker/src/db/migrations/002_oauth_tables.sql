-- ═══════════════════════════════════════════════════════════
-- OAuth Tables Migration
-- Adds OAuth support for Google and GitHub authentication
-- ═══════════════════════════════════════════════════════════

-- Add avatar_url to users table
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- ═══════════════════════════════════════════════════════════
-- OAUTH ACCOUNTS
-- Links OAuth provider accounts to users
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_name TEXT,
  provider_avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_user ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_accounts(provider, provider_user_id);

-- ═══════════════════════════════════════════════════════════
-- OAUTH STATES
-- Stores temporary state tokens for CSRF protection during OAuth flow
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  state TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  redirect_uri TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- ═══════════════════════════════════════════════════════════
-- Trigger for oauth_accounts updated_at
-- ═══════════════════════════════════════════════════════════
CREATE TRIGGER IF NOT EXISTS update_oauth_accounts_timestamp
AFTER UPDATE ON oauth_accounts
BEGIN
  UPDATE oauth_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
