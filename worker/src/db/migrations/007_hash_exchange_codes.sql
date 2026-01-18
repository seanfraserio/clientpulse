-- ═══════════════════════════════════════════════════════════
-- Hash Exchange Codes for Security
-- Exchange codes should be hashed like auth tokens to prevent
-- database access from compromising active exchange codes
-- ═══════════════════════════════════════════════════════════

-- Add code_hash column for secure storage
ALTER TABLE exchange_codes ADD COLUMN code_hash TEXT;

-- Create index on code_hash for lookups
CREATE INDEX IF NOT EXISTS idx_exchange_codes_hash ON exchange_codes(code_hash);
