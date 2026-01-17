-- ═══════════════════════════════════════════════════════════
-- ClientPulse Database Schema
-- D1 (SQLite) - Cloudflare
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'America/New_York',

  -- Subscription
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  plan_period TEXT DEFAULT 'monthly' CHECK (plan_period IN ('monthly', 'yearly')),
  plan_expires_at DATETIME,

  -- Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,

  -- Preferences
  daily_digest_enabled BOOLEAN DEFAULT TRUE,
  daily_digest_time TEXT DEFAULT '08:00',

  -- Stats
  clients_count INTEGER DEFAULT 0,
  notes_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending_deletion', 'deleted')),
  deletion_scheduled_at DATETIME,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);

-- ═══════════════════════════════════════════════════════════
-- AUTHENTICATION TOKENS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'magic_link' CHECK (type IN ('magic_link', 'session')),
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

-- ═══════════════════════════════════════════════════════════
-- CLIENTS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,

  -- Organization
  tags TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

  -- AI-enriched fields
  ai_summary TEXT,
  ai_communication_prefs TEXT,
  ai_personal_details TEXT DEFAULT '[]',
  ai_working_style TEXT,

  -- Health tracking
  health_score INTEGER DEFAULT 100,
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'watch', 'attention')),
  health_signals TEXT DEFAULT '[]',
  health_trend TEXT DEFAULT 'stable' CHECK (health_trend IN ('improving', 'stable', 'declining')),
  health_updated_at DATETIME,

  -- Activity tracking
  last_contact_at DATETIME,
  next_followup_at DATETIME,
  total_meetings INTEGER DEFAULT 0,
  client_since DATE,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_user_status ON clients(user_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_health ON clients(user_id, health_status);
CREATE INDEX IF NOT EXISTS idx_clients_last_contact ON clients(user_id, last_contact_at);

-- ═══════════════════════════════════════════════════════════
-- NOTES
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Note type and metadata
  note_type TEXT DEFAULT 'meeting' CHECK (note_type IN ('meeting', 'quick', 'email', 'call')),
  title TEXT,
  meeting_date DATETIME,
  meeting_type TEXT CHECK (meeting_type IN ('video_call', 'phone', 'in_person', 'async')),
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
  mood TEXT DEFAULT 'neutral' CHECK (mood IN ('positive', 'neutral', 'negative')),

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

CREATE INDEX IF NOT EXISTS idx_notes_client ON notes(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_type ON notes(user_id, note_type);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(client_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_notes_ai_status ON notes(ai_status);

-- ═══════════════════════════════════════════════════════════
-- ACTION ITEMS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS action_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,

  -- Content
  description TEXT NOT NULL,
  owner TEXT DEFAULT 'me' CHECK (owner IN ('me', 'client')),

  -- Status tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  due_date DATE,
  completed_at DATETIME,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_actions_client ON action_items(client_id);
CREATE INDEX IF NOT EXISTS idx_actions_user_status ON action_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_user_owner ON action_items(user_id, owner, status);
CREATE INDEX IF NOT EXISTS idx_actions_due ON action_items(user_id, status, due_date);

-- ═══════════════════════════════════════════════════════════
-- BRIEFINGS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Content
  meeting_date DATETIME,
  content TEXT NOT NULL,
  relationship_summary TEXT,
  open_actions_mine TEXT DEFAULT '[]',
  open_actions_theirs TEXT DEFAULT '[]',
  topics_to_discuss TEXT DEFAULT '[]',
  personal_touches TEXT DEFAULT '[]',
  suggested_opener TEXT,

  -- Tracking
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  viewed_at DATETIME,
  sent_via_email BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_briefings_client ON briefings(client_id);
CREATE INDEX IF NOT EXISTS idx_briefings_date ON briefings(user_id, meeting_date DESC);

-- ═══════════════════════════════════════════════════════════
-- HEALTH SNAPSHOTS (for trend analysis)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS health_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  signals TEXT DEFAULT '[]',
  snapshot_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_client_date ON health_snapshots(client_id, snapshot_date DESC);

-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTION EVENTS (audit trail)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  previous_plan TEXT,
  new_plan TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user ON subscription_events(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- USAGE TRACKING (for limits enforcement)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS usage_tracking (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  notes_created INTEGER DEFAULT 0,
  ai_requests INTEGER DEFAULT 0,
  search_queries INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_period ON usage_tracking(user_id, period);

-- ═══════════════════════════════════════════════════════════
-- DIGEST LOG
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS digest_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  attention_count INTEGER,
  watch_count INTEGER,
  action_count INTEGER,
  email_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_digest_user ON digest_log(user_id, sent_at DESC);

-- ═══════════════════════════════════════════════════════════
-- AUDIT LOG (security)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════
-- TRIGGERS for updated_at
-- ═══════════════════════════════════════════════════════════
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_clients_timestamp
AFTER UPDATE ON clients
BEGIN
  UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_notes_timestamp
AFTER UPDATE ON notes
BEGIN
  UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_actions_timestamp
AFTER UPDATE ON action_items
BEGIN
  UPDATE action_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
