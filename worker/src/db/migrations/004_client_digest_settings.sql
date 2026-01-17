-- ═══════════════════════════════════════════════════════════
-- Client Digest Settings Migration
-- Adds per-client toggle for daily digest inclusion
-- ═══════════════════════════════════════════════════════════

-- Add digest_enabled column to clients table (default enabled)
ALTER TABLE clients ADD COLUMN digest_enabled INTEGER DEFAULT 1;
