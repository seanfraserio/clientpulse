-- ═══════════════════════════════════════════════════════════
-- Security Improvements Migration
-- - Exchange codes table for secure OAuth flow
-- - Token hash column for secure token storage
-- - Absolute session timeout tracking
-- ═══════════════════════════════════════════════════════════

-- Exchange codes for OAuth (one-time use, short-lived)
CREATE TABLE IF NOT EXISTS exchange_codes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code TEXT UNIQUE NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_codes_code ON exchange_codes(code);
CREATE INDEX IF NOT EXISTS idx_exchange_codes_expires ON exchange_codes(expires_at);

-- Add token_hash column to auth_tokens for secure storage
-- We keep the original token column temporarily for migration but will stop using it
ALTER TABLE auth_tokens ADD COLUMN token_hash TEXT;

-- Add absolute_expires_at for session timeout that can't be extended
ALTER TABLE auth_tokens ADD COLUMN absolute_expires_at DATETIME;

-- Create index on token_hash for lookups
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
