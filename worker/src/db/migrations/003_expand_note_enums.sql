-- Migration: Expand notes table enums to match frontend values
-- This migration alters CHECK constraints for meeting_type and mood

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- First, create new table with expanded constraints

CREATE TABLE IF NOT EXISTS notes_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Note type and metadata
  note_type TEXT DEFAULT 'meeting' CHECK (note_type IN ('meeting', 'quick', 'email', 'call')),
  title TEXT,
  meeting_date DATETIME,
  -- Expanded meeting_type to include frontend values
  meeting_type TEXT CHECK (meeting_type IN ('meeting', 'call', 'email', 'chat', 'video_call', 'phone', 'in_person', 'async', 'other')),
  duration_minutes INTEGER,
  attendees TEXT DEFAULT '[]',

  -- User-entered content
  summary TEXT,
  discussed TEXT,
  decisions TEXT,
  action_items_raw TEXT,
  concerns TEXT,
  personal_notes TEXT,
  next_steps TEXT,
  -- Expanded mood to include frontend values
  mood TEXT DEFAULT 'neutral' CHECK (mood IN ('positive', 'neutral', 'negative', 'concerned', 'frustrated')),

  -- AI-processed content
  ai_status TEXT DEFAULT 'pending' CHECK (ai_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_error TEXT,
  ai_summary TEXT,
  ai_risk_signals TEXT DEFAULT '[]',
  ai_personal_details TEXT DEFAULT '[]',
  ai_sentiment_score REAL,
  ai_topics TEXT DEFAULT '[]',

  -- Vectorize reference
  embedding_id TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table
INSERT INTO notes_new SELECT * FROM notes;

-- Drop old table
DROP TABLE notes;

-- Rename new table
ALTER TABLE notes_new RENAME TO notes;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_notes_client ON notes(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_type ON notes(user_id, note_type);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(client_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_notes_ai_status ON notes(ai_status);

-- Recreate trigger
CREATE TRIGGER IF NOT EXISTS update_notes_timestamp
AFTER UPDATE ON notes
BEGIN
  UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
