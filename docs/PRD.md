# ClientPulse - Relationship Radar for Tech Freelancers

## Project Overview

Build "ClientPulse" - an AI-powered client relationship health monitor for tech freelancers (developers, designers, consultants). The core feature is the **Relationship Radar** - a dashboard that proactively alerts users when client relationships need attention, before they go cold.

**Tagline**: "Your client relationships have a pulse. Know when they need attention."

**Target User**: Tech freelancers managing 3-15 active clients who want to prevent relationship decay and never miss follow-ups.

**Core Value Proposition**: Instead of reactive "I forgot about this client" moments, users get proactive alerts like "Acme Corp hasn't heard from you in 18 days and you have 2 overdue commitments."

## Tech Stack (Cloudflare Free Tier - $0/month)

- **Frontend**: Astro 5 + React 19 + Tailwind CSS v4
- **Backend**: Cloudflare Workers (TypeScript)
- **Database**: Cloudflare D1 (SQLite)
- **File Storage**: Cloudflare R2 (for future attachments)
- **AI/LLM**: Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
- **Vector Search**: Cloudflare Vectorize (for semantic search on notes)
- **Email**: Resend (for magic links and daily digests)
- **Authentication**: Magic link email (no OAuth complexity)

## Core Features (MVP - 3 Week Build)

### 1. Relationship Radar Dashboard (Hero Feature)
The main dashboard showing client relationship health at a glance:

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 RELATIONSHIP RADAR                        Today, Jan 16 │
├─────────────────────────────────────────────────────────────┤
│ 🔴 NEEDS ATTENTION (2)                                      │
│ • Acme Corp - No contact 18 days, 2 overdue commitments     │
│ • StartupXYZ - Budget concerns mentioned twice recently     │
│                                                             │
│ 🟡 WATCH LIST (3)                                           │
│ • TechCo - Last contact 9 days ago                          │
│ • DevAgency - 1 open commitment pending                     │
│ • CloudStart - Sentiment trending negative                  │
│                                                             │
│ 🟢 HEALTHY (4)                                              │
│ • BigCorp, InnovateLab, DataFlow, WebAgency                 │
│                                                             │
│ 📋 YOUR OPEN COMMITMENTS (5 items)                          │
└─────────────────────────────────────────────────────────────┘
```

Each client card in "Needs Attention" shows:
- Why they need attention (specific signals)
- AI-suggested action to take
- Quick action buttons (Send Check-in, View Timeline, Snooze)

### 2. Client Profiles
- Basic info: name, company, email, role, tags
- Auto-enriched fields populated by AI from meeting notes:
  - Communication preferences (async vs sync, morning vs afternoon)
  - Personal details mentioned (family, hobbies, travel)
  - Working style observations
- Relationship health score (0-100) with trend indicator
- Last contact date and next follow-up reminder
- Quick stats: total meetings, months as client, open commitments

### 3. Meeting Notes (Primary Input Method)
Structured meeting note template optimized for AI extraction:

```typescript
interface MeetingNote {
  client_id: string;
  meeting_date: Date;
  meeting_type: 'video_call' | 'phone' | 'in_person' | 'async';
  attendees: string[];
  duration_minutes: number;

  // Structured sections (user fills these)
  summary: string;           // Quick 1-2 sentence summary
  discussed: string;         // Main topics covered
  decisions: string;         // What was decided
  action_items: string;      // Raw text, AI will parse
  concerns: string;          // Any red flags or worries expressed
  personal_notes: string;    // Personal details mentioned
  next_steps: string;        // What happens next
  mood: 'positive' | 'neutral' | 'negative';  // Quick sentiment

  // AI-processed fields (auto-populated)
  ai_summary?: string;
  ai_extracted_actions?: ActionItem[];
  ai_risk_signals?: string[];
  ai_personal_details?: string[];
  ai_sentiment_score?: number;
}
```

### 4. Action Item Tracking
- Auto-extracted from meeting notes by AI
- Assigned owner: "me" or "client"
- Due date (extracted or manually set)
- Status: open, completed, cancelled
- Overdue items surface prominently on Radar

### 5. Quick Notes (Secondary Input)
For non-meeting interactions:
- Quick text capture for emails, Slack messages, async updates
- Links to client automatically
- Feeds into relationship health calculation

### 6. Pre-Meeting Briefing
Before a scheduled meeting, generate AI briefing containing:
- Relationship summary (current health, recent trend)
- Last 3 interactions summary
- Open action items (yours and theirs)
- Topics to follow up on
- Personal details to potentially reference
- Suggested conversation starters

### 7. Daily Digest Email
Sent each morning with:
- Clients needing immediate attention
- Commitments due today or overdue
- Suggested actions for the day
- Link to full Radar dashboard

## Relationship Health Algorithm

The core IP - how we calculate relationship health:

```typescript
interface HealthScore {
  score: number;           // 0-100
  status: 'healthy' | 'watch' | 'attention';
  signals: Signal[];
  suggested_action: string;
  trend: 'improving' | 'stable' | 'declining';
}

interface Signal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  evidence?: string;
}

type SignalType =
  | 'contact_gap'           // No interaction in X days
  | 'overdue_commitment'    // You promised something and didn't deliver
  | 'client_overdue'        // They promised something and didn't deliver
  | 'negative_sentiment'    // Recent meetings had negative mood
  | 'budget_mention'        // Budget/cost concerns mentioned
  | 'scope_concerns'        // Scope creep or unclear deliverables
  | 'competitor_mention'    // They mentioned alternatives
  | 'delayed_response'      // Longer gaps between their responses
  | 'positive_signal';      // Good things (referral, praise, expansion)

function calculateHealthScore(
  client: Client,
  notes: Note[],
  actions: ActionItem[]
): HealthScore {
  let score = 100;
  const signals: Signal[] = [];

  // ═══════════════════════════════════════════════════════════
  // FACTOR 1: Contact Recency (Weight: 30 points max deduction)
  // ═══════════════════════════════════════════════════════════
  const daysSinceContact = daysBetween(client.last_contact_at, now());

  if (daysSinceContact > 28) {
    score -= 30;
    signals.push({
      type: 'contact_gap',
      severity: 'high',
      title: 'Gone quiet',
      description: `No contact in ${daysSinceContact} days`,
      evidence: `Last interaction: ${formatDate(client.last_contact_at)}`
    });
  } else if (daysSinceContact > 21) {
    score -= 20;
    signals.push({
      type: 'contact_gap',
      severity: 'high',
      title: 'Needs check-in',
      description: `No contact in ${daysSinceContact} days`
    });
  } else if (daysSinceContact > 14) {
    score -= 10;
    signals.push({
      type: 'contact_gap',
      severity: 'medium',
      title: 'Getting quiet',
      description: `No contact in ${daysSinceContact} days`
    });
  } else if (daysSinceContact > 7) {
    score -= 5;
    signals.push({
      type: 'contact_gap',
      severity: 'low',
      title: 'Routine check recommended',
      description: `${daysSinceContact} days since last contact`
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FACTOR 2: Your Commitments (Weight: 25 points max deduction)
  // ═══════════════════════════════════════════════════════════
  const myOpenActions = actions.filter(a =>
    a.owner === 'me' && a.status === 'open'
  );
  const myOverdueActions = myOpenActions.filter(a =>
    a.due_date && isPast(a.due_date)
  );

  if (myOverdueActions.length >= 3) {
    score -= 25;
    signals.push({
      type: 'overdue_commitment',
      severity: 'high',
      title: 'Multiple overdue commitments',
      description: `${myOverdueActions.length} things you promised are overdue`,
      evidence: myOverdueActions.map(a => a.description).join(', ')
    });
  } else if (myOverdueActions.length === 2) {
    score -= 18;
    signals.push({
      type: 'overdue_commitment',
      severity: 'high',
      title: '2 overdue commitments',
      description: 'You have 2 overdue promises to this client'
    });
  } else if (myOverdueActions.length === 1) {
    score -= 12;
    signals.push({
      type: 'overdue_commitment',
      severity: 'medium',
      title: '1 overdue commitment',
      description: `"${myOverdueActions[0].description}" is overdue`
    });
  }

  // Pending (not overdue) commitments - minor deduction
  const pendingNotOverdue = myOpenActions.length - myOverdueActions.length;
  if (pendingNotOverdue > 3) {
    score -= 5;
    signals.push({
      type: 'overdue_commitment',
      severity: 'low',
      title: 'Many open items',
      description: `${pendingNotOverdue} commitments pending (not overdue yet)`
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FACTOR 3: Sentiment Trend (Weight: 25 points max deduction)
  // ═══════════════════════════════════════════════════════════
  const recentNotes = notes.filter(n =>
    daysBetween(n.created_at, now()) <= 60
  );

  if (recentNotes.length >= 2) {
    const sentimentScores = recentNotes.map(n =>
      n.mood === 'positive' ? 1 : n.mood === 'negative' ? -1 : 0
    );
    const avgSentiment = average(sentimentScores);
    const trend = calculateTrend(sentimentScores); // Are recent ones worse?

    if (avgSentiment < -0.3 || trend === 'declining') {
      score -= 20;
      signals.push({
        type: 'negative_sentiment',
        severity: 'high',
        title: 'Sentiment declining',
        description: 'Recent interactions have been negative',
        evidence: extractNegativeQuotes(recentNotes)
      });
    } else if (avgSentiment < 0) {
      score -= 10;
      signals.push({
        type: 'negative_sentiment',
        severity: 'medium',
        title: 'Mixed sentiment',
        description: 'Some recent interactions were negative'
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // FACTOR 4: Risk Keywords (Weight: 20 points max deduction)
  // ═══════════════════════════════════════════════════════════
  const riskKeywords = {
    budget: ['budget', 'cost', 'expensive', 'afford', 'cheaper', 'price'],
    scope: ['scope', 'scope creep', 'out of scope', 'additional', 'extra work'],
    competitor: ['alternative', 'competitor', 'other options', 'shopping around'],
    timeline: ['delay', 'behind schedule', 'late', 'deadline', 'rushed'],
    dissatisfaction: ['frustrated', 'disappointed', 'concerned', 'worried', 'unhappy']
  };

  const allNoteText = recentNotes.map(n =>
    `${n.discussed} ${n.concerns} ${n.summary}`.toLowerCase()
  ).join(' ');

  const foundRisks: string[] = [];
  for (const [category, keywords] of Object.entries(riskKeywords)) {
    const found = keywords.filter(kw => allNoteText.includes(kw));
    if (found.length > 0) {
      foundRisks.push(category);
    }
  }

  if (foundRisks.includes('competitor')) {
    score -= 15;
    signals.push({
      type: 'competitor_mention',
      severity: 'high',
      title: 'Competitor mentioned',
      description: 'Client mentioned alternatives or competitors'
    });
  }

  if (foundRisks.includes('budget')) {
    score -= 10;
    signals.push({
      type: 'budget_mention',
      severity: 'medium',
      title: 'Budget concerns',
      description: 'Client mentioned budget or cost concerns'
    });
  }

  if (foundRisks.includes('dissatisfaction')) {
    score -= 10;
    signals.push({
      type: 'negative_sentiment',
      severity: 'medium',
      title: 'Dissatisfaction signals',
      description: 'Client expressed frustration or disappointment'
    });
  }

  // ═══════════════════════════════════════════════════════════
  // POSITIVE SIGNALS (Can add up to 10 points back)
  // ═══════════════════════════════════════════════════════════
  const positiveKeywords = ['referral', 'recommend', 'great work', 'expand',
                           'more work', 'love', 'amazing', 'excellent'];
  const hasPositive = positiveKeywords.some(kw => allNoteText.includes(kw));

  if (hasPositive) {
    score = Math.min(100, score + 10);
    signals.push({
      type: 'positive_signal',
      severity: 'low',
      title: 'Positive signals detected',
      description: 'Client expressed satisfaction or mentioned referrals'
    });
  }

  // ═══════════════════════════════════════════════════════════
  // FINAL CALCULATIONS
  // ═══════════════════════════════════════════════════════════
  score = Math.max(0, Math.min(100, score));

  const status: HealthStatus =
    score >= 70 ? 'healthy' :
    score >= 40 ? 'watch' :
    'attention';

  // Calculate trend by comparing to 30 days ago
  const trend = calculateHealthTrend(client.id, score);

  // Generate suggested action based on top signal
  const suggested_action = generateSuggestedAction(signals, client);

  return { score, status, signals, suggested_action, trend };
}

function generateSuggestedAction(signals: Signal[], client: Client): string {
  const topSignal = signals.find(s => s.severity === 'high') || signals[0];

  if (!topSignal) return 'Relationship is healthy. Keep up the good work!';

  switch (topSignal.type) {
    case 'contact_gap':
      return `Send a quick check-in message to ${client.name}`;
    case 'overdue_commitment':
      return `Complete or update status on your overdue commitment`;
    case 'negative_sentiment':
      return `Schedule a call to address concerns directly`;
    case 'budget_mention':
      return `Proactively discuss scope options or payment flexibility`;
    case 'competitor_mention':
      return `Reinforce your value and discuss their needs`;
    default:
      return `Review recent interactions with ${client.name}`;
  }
}
```

## Database Schema (D1)

```sql
-- ═══════════════════════════════════════════════════════════
-- USERS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'America/New_York',

  -- Subscription
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  plan_expires_at DATETIME,

  -- Preferences
  daily_digest_enabled BOOLEAN DEFAULT TRUE,
  daily_digest_time TEXT DEFAULT '08:00', -- Local time

  -- Stats
  clients_count INTEGER DEFAULT 0,
  notes_count INTEGER DEFAULT 0,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- ═══════════════════════════════════════════════════════════
-- AUTHENTICATION
-- ═══════════════════════════════════════════════════════════
CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'magic_link' CHECK (type IN ('magic_link', 'session')),
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);

-- ═══════════════════════════════════════════════════════════
-- CLIENTS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE clients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,                    -- "CTO", "Product Manager", etc.

  -- Organization
  tags TEXT DEFAULT '[]',       -- JSON array: ["retainer", "startup", "design"]
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

  -- AI-enriched fields (auto-populated from notes)
  ai_summary TEXT,                      -- AI-generated relationship summary
  ai_communication_prefs TEXT,          -- "Prefers async, morning meetings"
  ai_personal_details TEXT DEFAULT '[]', -- JSON: ["Has 2 kids", "Loves hiking"]
  ai_working_style TEXT,                -- "Detail-oriented, needs written specs"

  -- Health tracking
  health_score INTEGER DEFAULT 100,
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'watch', 'attention')),
  health_signals TEXT DEFAULT '[]',     -- JSON array of current signals
  health_trend TEXT DEFAULT 'stable' CHECK (health_trend IN ('improving', 'stable', 'declining')),
  health_updated_at DATETIME,

  -- Activity tracking
  last_contact_at DATETIME,
  next_followup_at DATETIME,
  total_meetings INTEGER DEFAULT 0,
  client_since DATE,

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived_at DATETIME
);

CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_health ON clients(user_id, health_status);
CREATE INDEX idx_clients_last_contact ON clients(user_id, last_contact_at);

-- ═══════════════════════════════════════════════════════════
-- NOTES (Meeting Notes + Quick Notes)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Note type and metadata
  note_type TEXT DEFAULT 'meeting' CHECK (note_type IN ('meeting', 'quick', 'email', 'call')),
  title TEXT,
  meeting_date DATETIME,
  meeting_type TEXT CHECK (meeting_type IN ('video_call', 'phone', 'in_person', 'async')),
  duration_minutes INTEGER,
  attendees TEXT DEFAULT '[]',  -- JSON array

  -- User-entered content (structured for meetings)
  summary TEXT,                 -- Quick 1-2 sentence summary
  discussed TEXT,               -- Main topics covered
  decisions TEXT,               -- What was decided
  action_items_raw TEXT,        -- Raw text before AI parsing
  concerns TEXT,                -- Red flags or worries
  personal_notes TEXT,          -- Personal details mentioned
  next_steps TEXT,              -- What happens next
  mood TEXT CHECK (mood IN ('positive', 'neutral', 'negative')),

  -- AI-processed content
  ai_summary TEXT,
  ai_risk_signals TEXT DEFAULT '[]',      -- JSON array
  ai_personal_details TEXT DEFAULT '[]',  -- JSON array
  ai_sentiment_score REAL,                -- -1 to 1
  ai_topics TEXT DEFAULT '[]',            -- JSON array of topics

  -- Vectorize reference for semantic search
  embedding_id TEXT,

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notes_client ON notes(client_id);
CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_date ON notes(client_id, meeting_date DESC);

-- ═══════════════════════════════════════════════════════════
-- ACTION ITEMS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE action_items (
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

  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_actions_client ON action_items(client_id);
CREATE INDEX idx_actions_user_status ON action_items(user_id, status);
CREATE INDEX idx_actions_due ON action_items(user_id, status, due_date);

-- ═══════════════════════════════════════════════════════════
-- BRIEFINGS (Pre-meeting AI-generated summaries)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE briefings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Content
  meeting_date DATETIME,
  content TEXT NOT NULL,                  -- Full markdown briefing
  relationship_summary TEXT,
  open_actions_mine TEXT DEFAULT '[]',    -- JSON array
  open_actions_theirs TEXT DEFAULT '[]',  -- JSON array
  topics_to_discuss TEXT DEFAULT '[]',    -- JSON array
  personal_touches TEXT DEFAULT '[]',     -- JSON array
  suggested_opener TEXT,

  -- Tracking
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  viewed_at DATETIME,
  sent_via_email BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_briefings_client ON briefings(client_id);
CREATE INDEX idx_briefings_date ON briefings(user_id, meeting_date DESC);

-- ═══════════════════════════════════════════════════════════
-- HEALTH HISTORY (For trend analysis)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE health_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  signals TEXT DEFAULT '[]',  -- JSON array
  snapshot_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_health_client_date ON health_snapshots(client_id, snapshot_date DESC);

-- ═══════════════════════════════════════════════════════════
-- DIGEST LOG (Track sent digests)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE digest_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  attention_count INTEGER,
  watch_count INTEGER,
  action_count INTEGER,
  email_id TEXT  -- From Resend for tracking
);

CREATE INDEX idx_digest_user ON digest_log(user_id, sent_at DESC);
```

## API Endpoints (Cloudflare Workers)

```
# ═══════════════════════════════════════════════════════════
# AUTHENTICATION
# ═══════════════════════════════════════════════════════════
POST   /api/auth/magic-link          # Send magic link email
GET    /api/auth/verify?token=xxx    # Verify magic link, create session
POST   /api/auth/logout              # Clear session
GET    /api/auth/me                  # Get current user

# ═══════════════════════════════════════════════════════════
# DASHBOARD / RADAR
# ═══════════════════════════════════════════════════════════
GET    /api/radar                    # Main radar data (clients by health status)
GET    /api/radar/attention          # Only "needs attention" clients
GET    /api/radar/commitments        # All open action items (mine)
GET    /api/radar/stats              # Dashboard statistics

# ═══════════════════════════════════════════════════════════
# CLIENTS
# ═══════════════════════════════════════════════════════════
GET    /api/clients                  # List all clients (with health status)
POST   /api/clients                  # Create new client
GET    /api/clients/:id              # Get client detail + recent notes
PUT    /api/clients/:id              # Update client
DELETE /api/clients/:id              # Archive client (soft delete)
GET    /api/clients/:id/timeline     # Full interaction timeline
GET    /api/clients/:id/health       # Health score breakdown
POST   /api/clients/:id/recalculate  # Force health recalculation

# ═══════════════════════════════════════════════════════════
# NOTES
# ═══════════════════════════════════════════════════════════
GET    /api/notes                    # List notes (filterable by client)
POST   /api/notes                    # Create note (triggers AI processing)
GET    /api/notes/:id                # Get note detail
PUT    /api/notes/:id                # Update note
DELETE /api/notes/:id                # Delete note

# ═══════════════════════════════════════════════════════════
# ACTION ITEMS
# ═══════════════════════════════════════════════════════════
GET    /api/actions                  # List all action items
GET    /api/actions/open             # List open items only
GET    /api/actions/overdue          # List overdue items
POST   /api/actions                  # Create manual action item
PUT    /api/actions/:id              # Update action item
POST   /api/actions/:id/complete     # Mark as completed
DELETE /api/actions/:id              # Delete action item

# ═══════════════════════════════════════════════════════════
# BRIEFINGS
# ═══════════════════════════════════════════════════════════
GET    /api/clients/:id/briefing     # Get or generate briefing
POST   /api/clients/:id/briefing     # Force regenerate briefing
POST   /api/briefings/:id/email      # Email briefing to self

# ═══════════════════════════════════════════════════════════
# SEARCH
# ═══════════════════════════════════════════════════════════
POST   /api/search                   # Semantic search across all notes
  # Body: { query: "what did john say about timeline?" }

# ═══════════════════════════════════════════════════════════
# USER SETTINGS
# ═══════════════════════════════════════════════════════════
GET    /api/settings                 # Get user settings
PUT    /api/settings                 # Update settings
POST   /api/settings/test-digest     # Send test digest email
```

## Frontend Pages & Routes

```
/                           # Landing page (marketing)
/login                      # Magic link login form
/dashboard                  # Main Relationship Radar (hero page)
/clients                    # Client list view
/clients/new                # Add new client form
/clients/:id                # Client detail + timeline
/clients/:id/briefing       # Pre-meeting briefing view
/notes                      # All notes list (searchable)
/notes/new                  # New meeting note form
/notes/new?client=:id       # New note for specific client
/notes/:id                  # View/edit note
/actions                    # Action items list
/search                     # Semantic search interface
/settings                   # User preferences
```

## React Components

```
src/components/
├── radar/
│   ├── RadarDashboard.tsx       # Main radar layout
│   ├── ClientHealthCard.tsx     # Card for each client in radar
│   ├── HealthBadge.tsx          # Visual health indicator (🔴🟡🟢)
│   ├── SignalsList.tsx          # List of health signals
│   ├── SuggestedAction.tsx      # AI-suggested action with CTA
│   └── CommitmentsList.tsx      # Open action items summary
├── clients/
│   ├── ClientList.tsx           # Sortable/filterable client list
│   ├── ClientCard.tsx           # Client summary card
│   ├── ClientDetail.tsx         # Full client view
│   ├── ClientForm.tsx           # Create/edit client
│   ├── ClientTimeline.tsx       # Chronological interaction list
│   └── HealthScoreBreakdown.tsx # Detailed score explanation
├── notes/
│   ├── MeetingNoteForm.tsx      # Structured meeting note input
│   ├── QuickNoteForm.tsx        # Quick note capture
│   ├── NoteCard.tsx             # Note summary display
│   ├── NoteDetail.tsx           # Full note view
│   └── MoodSelector.tsx         # Positive/Neutral/Negative toggle
├── actions/
│   ├── ActionItemList.tsx       # List with filters
│   ├── ActionItemCard.tsx       # Individual action item
│   └── ActionItemForm.tsx       # Create/edit action
├── briefings/
│   ├── BriefingView.tsx         # Full briefing display
│   └── BriefingCard.tsx         # Summary for dashboard
├── search/
│   ├── SearchInput.tsx          # Search bar with suggestions
│   └── SearchResults.tsx        # Results with highlights
├── shared/
│   ├── Layout.tsx               # App shell with nav
│   ├── Header.tsx               # Top navigation
│   ├── Sidebar.tsx              # Left navigation
│   ├── Button.tsx               # Styled button variants
│   ├── Card.tsx                 # Card container
│   ├── Badge.tsx                # Status badges
│   ├── Modal.tsx                # Modal dialog
│   ├── Toast.tsx                # Notifications
│   ├── EmptyState.tsx           # Empty state illustrations
│   └── Loading.tsx              # Loading states
└── auth/
    ├── LoginForm.tsx            # Magic link request
    └── VerifyingScreen.tsx      # "Checking your link..."
```

## AI Processing Pipelines

### 1. Note Processing (On note creation/update)

```typescript
async function processNote(note: Note): Promise<ProcessedNote> {
  // 1. Generate AI summary and extract structured data
  const aiAnalysis = await analyzeNoteWithAI(note);

  // 2. Extract action items from raw text
  const extractedActions = await extractActionItems(note.action_items_raw);

  // 3. Create action item records
  for (const action of extractedActions) {
    await db.insert('action_items', {
      user_id: note.user_id,
      client_id: note.client_id,
      note_id: note.id,
      description: action.description,
      owner: action.owner,
      due_date: action.due_date
    });
  }

  // 4. Generate embedding for semantic search
  const embedding = await generateEmbedding(
    `${note.summary} ${note.discussed} ${note.decisions}`
  );

  // 5. Store in Vectorize
  await vectorize.upsert({
    id: note.id,
    values: embedding,
    metadata: {
      user_id: note.user_id,
      client_id: note.client_id,
      type: 'note',
      date: note.meeting_date
    }
  });

  // 6. Update note with AI fields
  await db.update('notes', note.id, {
    ai_summary: aiAnalysis.summary,
    ai_risk_signals: JSON.stringify(aiAnalysis.risks),
    ai_personal_details: JSON.stringify(aiAnalysis.personalDetails),
    ai_sentiment_score: aiAnalysis.sentimentScore,
    embedding_id: note.id
  });

  // 7. Update client's last_contact and enriched fields
  await updateClientFromNote(note.client_id, aiAnalysis);

  // 8. Recalculate client health score
  await recalculateClientHealth(note.client_id);

  return { ...note, ...aiAnalysis };
}
```

### 2. Health Recalculation (Triggered by note changes, daily cron)

```typescript
async function recalculateClientHealth(clientId: string): Promise<void> {
  const client = await db.get('clients', clientId);
  const notes = await db.query('notes', { client_id: clientId, limit: 20 });
  const actions = await db.query('action_items', {
    client_id: clientId,
    status: 'open'
  });

  const health = calculateHealthScore(client, notes, actions);

  // Update client record
  await db.update('clients', clientId, {
    health_score: health.score,
    health_status: health.status,
    health_signals: JSON.stringify(health.signals),
    health_trend: health.trend,
    health_updated_at: new Date()
  });

  // Store snapshot for trend analysis
  await db.insert('health_snapshots', {
    client_id: clientId,
    score: health.score,
    status: health.status,
    signals: JSON.stringify(health.signals),
    snapshot_date: new Date().toISOString().split('T')[0]
  });
}
```

### 3. Daily Digest Generation (Cron: 0 * * * *)

```typescript
// Runs every hour, sends to users whose local time matches their preference
async function generateAndSendDigests(): Promise<void> {
  const currentHour = new Date().getUTCHours();

  // Find users whose digest time matches current UTC hour
  const users = await findUsersForDigest(currentHour);

  for (const user of users) {
    // Get radar data
    const attentionClients = await getClientsByHealth(user.id, 'attention');
    const watchClients = await getClientsByHealth(user.id, 'watch');
    const overdueActions = await getOverdueActions(user.id);
    const dueTodayActions = await getDueTodayActions(user.id);

    // Skip if nothing to report
    if (attentionClients.length === 0 && overdueActions.length === 0) {
      continue;
    }

    // Generate email content
    const emailHtml = generateDigestEmail({
      user,
      attentionClients,
      watchClients,
      overdueActions,
      dueTodayActions
    });

    // Send via Resend
    await resend.emails.send({
      from: 'ClientPulse <radar@clientpulse.app>',
      to: user.email,
      subject: `🎯 ${attentionClients.length} clients need attention`,
      html: emailHtml
    });

    // Log digest
    await db.insert('digest_log', {
      user_id: user.id,
      attention_count: attentionClients.length,
      watch_count: watchClients.length,
      action_count: overdueActions.length
    });
  }
}
```

## Workers AI Prompts

### Note Analysis Prompt

```
You are helping a freelancer organize their client meeting notes.
Analyze this meeting note and extract structured information.

Meeting Note:
---
Client: {client_name}
Date: {meeting_date}
Summary: {summary}
Discussed: {discussed}
Decisions: {decisions}
Action Items: {action_items_raw}
Concerns: {concerns}
Personal Notes: {personal_notes}
Mood: {mood}
---

Extract and return JSON:
{
  "summary": "Concise 1-2 sentence summary of the meeting",
  "action_items": [
    {
      "description": "Clear action item description",
      "owner": "me" or "client",
      "due_hint": "today/this week/next week/no specific date"
    }
  ],
  "risk_signals": [
    "Budget concerns mentioned",
    "Timeline pressure"
  ],
  "personal_details": [
    "Going on vacation next month",
    "Daughter starting college"
  ],
  "sentiment_score": 0.5,  // -1 (negative) to 1 (positive)
  "topics": ["api integration", "timeline", "budget"],
  "communication_insight": "Prefers detailed written updates"
}
```

### Briefing Generation Prompt

```
Generate a pre-meeting briefing for a freelancer.

Client: {client_name} at {company}
Relationship Health: {health_score}/100 ({health_status})
Client Since: {client_since}
Total Meetings: {total_meetings}

Recent Health Signals:
{health_signals}

Last 3 Interactions:
{recent_notes_summary}

My Open Commitments:
{my_open_actions}

Their Open Commitments:
{their_open_actions}

Personal Details Known:
{personal_details}

Generate a helpful briefing with:
1. **Relationship Snapshot** (2-3 sentences on current state)
2. **Topics to Discuss** (3-5 bullet points)
3. **Open Items to Address** (what's pending)
4. **Personal Touch** (1-2 things to mention naturally)
5. **Watch Out For** (any concerns to be aware of)
6. **Suggested Opening** (natural way to start the conversation)

Keep it concise and actionable. The freelancer will read this 5 minutes before the call.
```

## Project Structure

```
clientpulse/
├── astro.config.mjs
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   └── og-image.png
├── src/
│   ├── components/           # React components (see list above)
│   ├── layouts/
│   │   ├── Layout.astro      # Main app layout
│   │   └── AuthLayout.astro  # Login pages layout
│   ├── pages/
│   │   ├── index.astro       # Landing page
│   │   ├── login.astro
│   │   ├── dashboard.astro
│   │   ├── clients/
│   │   │   ├── index.astro
│   │   │   ├── new.astro
│   │   │   └── [id].astro
│   │   ├── notes/
│   │   │   ├── index.astro
│   │   │   ├── new.astro
│   │   │   └── [id].astro
│   │   ├── actions.astro
│   │   ├── search.astro
│   │   └── settings.astro
│   ├── lib/
│   │   ├── api.ts            # API client functions
│   │   ├── auth.ts           # Auth state management
│   │   ├── utils.ts          # Utility functions
│   │   └── types.ts          # TypeScript types
│   └── styles/
│       └── global.css        # Tailwind + custom styles
├── worker/
│   ├── wrangler.toml
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # Main worker entry, router
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── radar.ts
│       │   ├── clients.ts
│       │   ├── notes.ts
│       │   ├── actions.ts
│       │   ├── briefings.ts
│       │   ├── search.ts
│       │   └── settings.ts
│       ├── services/
│       │   ├── ai.ts         # Workers AI wrapper
│       │   ├── vectorize.ts  # Vectorize operations
│       │   ├── health.ts     # Health calculation logic
│       │   ├── email.ts      # Resend email service
│       │   └── processing.ts # Note processing pipeline
│       ├── db/
│       │   ├── schema.sql    # Full schema
│       │   ├── migrations/   # Schema migrations
│       │   └── queries.ts    # Database query helpers
│       ├── cron/
│       │   ├── digest.ts     # Daily digest sender
│       │   └── health.ts     # Periodic health recalc
│       └── utils/
│           ├── auth.ts       # Auth middleware
│           ├── response.ts   # API response helpers
│           └── validation.ts # Input validation
└── README.md
```

## Wrangler Configuration

```toml
name = "clientpulse-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "clientpulse"
database_id = "YOUR_D1_ID"

# R2 Storage (for future attachments)
[[r2_buckets]]
binding = "FILES"
bucket_name = "clientpulse-files"

# Vectorize Index
[[vectorize]]
binding = "NOTES_INDEX"
index_name = "clientpulse-notes"

# Workers AI
[ai]
binding = "AI"

# Environment Variables
[vars]
ENVIRONMENT = "development"
APP_URL = "http://localhost:4321"
FROM_EMAIL = "ClientPulse <radar@clientpulse.app>"

# Scheduled Tasks (Cron)
[triggers]
crons = [
  "0 * * * *",   # Every hour - check for digests to send
  "0 3 * * *"    # 3am UTC - nightly health recalculation
]

# Secrets (set via `wrangler secret put`)
# RESEND_API_KEY
# SESSION_SECRET
```

## Implementation Phases

### Phase 1: Foundation (Days 1-5)
- [ ] Initialize Astro project with React and Tailwind v4
- [ ] Set up Cloudflare Worker with Hono router
- [ ] Create D1 database with full schema
- [ ] Implement magic link authentication flow
- [ ] Build basic Layout and navigation components
- [ ] Create landing page
- [ ] Deploy to Cloudflare Pages + Workers

### Phase 2: Core Data (Days 6-10)
- [ ] Client CRUD operations (API + UI)
- [ ] Client list and detail pages
- [ ] Meeting note form with structured template
- [ ] Note list and detail pages
- [ ] Basic action item tracking
- [ ] Wire up all API endpoints

### Phase 3: The Radar (Days 11-15)
- [ ] Implement health calculation algorithm
- [ ] Create health_snapshots for trend tracking
- [ ] Build RadarDashboard component
- [ ] Build ClientHealthCard with signals display
- [ ] Create SuggestedAction component
- [ ] Add CommitmentsList to dashboard
- [ ] Connect AI for note analysis

### Phase 4: Intelligence (Days 16-20)
- [ ] Set up Vectorize index
- [ ] Implement note embedding on save
- [ ] Build semantic search endpoint + UI
- [ ] Create briefing generation logic
- [ ] Build BriefingView component
- [ ] Set up daily digest cron job
- [ ] Implement digest email template

### Phase 5: Polish (Days 21-25)
- [ ] Mobile responsive design pass
- [ ] Loading states and error handling
- [ ] Empty states with helpful CTAs
- [ ] Settings page (digest preferences)
- [ ] Performance optimization
- [ ] Final testing and bug fixes
- [ ] Production deployment

## Success Metrics

- **Activation**: User creates 2+ clients and 3+ notes in first week
- **Engagement**: User opens radar 3+ times per week
- **Retention**: 50% of users return after 7 days
- **Health accuracy**: <10% of users snooze/dismiss alerts as "not relevant"
- **Digest engagement**: >40% open rate on daily digest emails

## Free Tier Budget Estimation

| Service | Free Limit | Expected Usage (1K users) | Status |
|---------|-----------|---------------------------|--------|
| Workers | 100K req/day | ~20K req/day | ✅ Safe |
| D1 | 5GB, 5M reads/day | ~500MB, 500K reads | ✅ Safe |
| Workers AI | 10K neurons/day | ~5K neurons/day | ✅ Safe |
| Vectorize | 5M dimensions | ~500K dimensions | ✅ Safe |
| R2 | 10GB | ~1GB | ✅ Safe |
