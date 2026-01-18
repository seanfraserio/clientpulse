# ClientPulse Architecture

A client relationship management (CRM) application built on Cloudflare's edge platform.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Frontend Architecture](#frontend-architecture)
5. [Backend Architecture](#backend-architecture)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Authentication](#authentication)
9. [Services](#services)
10. [Security](#security)
11. [Deployment](#deployment)

---

## Overview

ClientPulse is a client relationship management tool that helps track client interactions, health scores, action items, and sends automated digest emails. It features AI-powered note summarization and sentiment analysis.

### Key Features

- **Client Management**: Track clients with health scoring and relationship status
- **Notes & Meetings**: Log interactions with AI-generated summaries
- **Action Items**: Track commitments with due dates and ownership
- **Health Scoring**: Automated client health calculation based on activity
- **Daily Digests**: Scheduled email summaries of client activity
- **AI Analysis**: Automatic sentiment analysis and key points extraction
- **Billing Integration**: Stripe-based subscription management

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Astro 5.x, React 19, TypeScript |
| Styling | Tailwind CSS 4.x |
| Backend | Cloudflare Workers, Hono framework |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Queue | Cloudflare Queues |
| AI | Cloudflare Workers AI, Google Gemini (fallback) |
| Email | Resend API |
| Payments | Stripe |
| Auth | Magic links, OAuth (Google, GitHub) |

---

## Project Structure

```
clientpulse/
├── src/                      # Frontend (Astro + React)
│   ├── components/           # React components
│   ├── layouts/              # Astro layouts
│   ├── lib/                  # Utilities (api.ts, utils.ts)
│   ├── pages/                # Astro pages/routes
│   └── styles/               # Global styles
├── worker/                   # Backend (Cloudflare Worker)
│   └── src/
│       ├── db/               # Database layer
│       │   ├── migrations/   # SQL migrations
│       │   └── tenant-db.ts  # Multi-tenant DB wrapper
│       ├── middleware/       # Hono middleware
│       ├── routes/           # API route handlers
│       └── services/         # Business logic
├── shared/                   # Shared code
│   └── types.ts              # TypeScript interfaces
├── functions/api/            # Cloudflare Pages Functions (proxy)
└── public/                   # Static assets
```

---

## Frontend Architecture

### Pages (Astro)

| Route | File | Description |
|-------|------|-------------|
| `/` | `index.astro` | Landing/marketing page |
| `/login` | `login.astro` | Authentication page |
| `/auth/callback` | `auth/callback.astro` | OAuth callback handler |
| `/app` | `app.astro` | Main dashboard |
| `/app/clients` | `app/clients.astro` | Client list |
| `/app/clients/[id]` | `app/clients/[id].astro` | Client detail |
| `/app/clients/new` | `app/clients/new.astro` | Create client |
| `/app/notes` | `app/notes.astro` | Notes list |
| `/app/notes/new` | `app/notes/new.astro` | Create note |
| `/app/settings` | `app/settings.astro` | User settings |
| `/app/billing` | `app/billing.astro` | Subscription management |

### React Components

```
src/components/
├── ActionCard.tsx        # Action item display
├── ActionForm.tsx        # Create/edit action items
├── AuthCallback.tsx      # OAuth callback handler
├── BillingPage.tsx       # Stripe billing UI
├── ClientCard.tsx        # Client summary card
├── ClientDetail.tsx      # Full client view
├── ClientForm.tsx        # Create/edit client
├── ClientsPage.tsx       # Client list with filters
├── Dashboard.tsx         # Main dashboard view
├── Header.tsx            # Navigation header
├── LoginPage.tsx         # Auth forms
├── NoteCard.tsx          # Note display card
├── NoteForm.tsx          # Create/edit notes
├── NotesPage.tsx         # Notes list with filters
├── RadarItem.tsx         # Attention radar item
├── SettingsPage.tsx      # User preferences
└── ViewToggle.tsx        # List/grid view switcher
```

### API Client (`src/lib/api.ts`)

Centralized fetch wrapper handling:
- Authorization header injection
- CSRF token management (localStorage-based)
- Cross-origin requests to worker API

```typescript
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response>
```

---

## Backend Architecture

### Entry Point (`worker/src/index.ts`)

Hono application with middleware chain:

```typescript
app.use('*', corsMiddleware);
app.use('/api/*', contentTypeMiddleware);
app.use('/api/*', rateLimitMiddleware);
app.route('/api/auth', authRoutes);
app.use('/api/*', authMiddleware);      // Protected routes below
app.use('/api/*', csrfMiddleware);
app.route('/api/clients', clientRoutes);
app.route('/api/notes', noteRoutes);
// ... more routes
```

### Middleware Stack

| Middleware | File | Purpose |
|------------|------|---------|
| CORS | `middleware/cors.ts` | Cross-origin headers |
| Content-Type | `middleware/content-type.ts` | JSON validation |
| Rate Limit | `middleware/rate-limit.ts` | Request throttling |
| Auth | `middleware/auth.ts` | Session validation |
| CSRF | `middleware/csrf.ts` | Cross-site request forgery protection |

### Route Modules

| Module | Base Path | Description |
|--------|-----------|-------------|
| `auth.ts` | `/api/auth` | Authentication endpoints |
| `clients.ts` | `/api/clients` | Client CRUD |
| `notes.ts` | `/api/notes` | Notes CRUD |
| `actions.ts` | `/api/actions` | Action items CRUD |
| `radar.ts` | `/api/radar` | Dashboard/attention data |
| `billing.ts` | `/api/billing` | Stripe integration |
| `webhooks.ts` | `/api/webhooks` | External webhooks |
| `settings.ts` | `/api/settings` | User preferences |

---

## Database Schema

### Core Tables

```
┌─────────────────┐     ┌─────────────────┐
│     users       │     │    clients      │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │◄────│ user_id (FK)    │
│ email           │     │ id (PK)         │
│ name            │     │ name            │
│ timezone        │     │ company         │
│ daily_digest_*  │     │ health_score    │
│ plan            │     │ status          │
│ stripe_*        │     │ digest_enabled  │
└─────────────────┘     └─────────────────┘
         │                      │
         │              ┌───────┴───────┐
         │              │               │
         ▼              ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    sessions     │  │     notes       │  │    actions      │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ token_hash (PK) │  │ id (PK)         │  │ id (PK)         │
│ user_id (FK)    │  │ client_id (FK)  │  │ client_id (FK)  │
│ expires_at      │  │ user_id (FK)    │  │ note_id (FK)    │
└─────────────────┘  │ content         │  │ title           │
                     │ note_type       │  │ owner           │
                     │ ai_summary      │  │ due_date        │
                     │ sentiment       │  │ status          │
                     └─────────────────┘  └─────────────────┘
```

### All Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts and preferences |
| `sessions` | Active login sessions (hashed tokens) |
| `magic_links` | Passwordless auth tokens (hashed) |
| `clients` | Client records with health scores |
| `notes` | Client interaction logs |
| `actions` | Action items/commitments |
| `digest_log` | Email digest send history |
| `audit_log` | Security audit trail |
| `subscriptions` | Stripe subscription data |
| `oauth_accounts` | Linked OAuth providers |
| `oauth_states` | CSRF protection for OAuth |
| `rate_limit_*` | Rate limiting counters |

### Migrations

Located in `worker/src/db/migrations/`:

```
001_initial_schema.sql      # Core tables
002_add_sentiment.sql       # AI sentiment field
003_billing_tables.sql      # Stripe integration
004_client_digest_settings.sql  # Per-client digest toggle
005_oauth_tables.sql        # OAuth support
006_security_enhancements.sql   # Token hashing, audit log
007_user_settings.sql       # User preferences
```

---

## API Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/magic-link` | Send magic link email |
| `POST` | `/auth/verify` | Verify magic link token |
| `POST` | `/auth/logout` | End session |
| `GET` | `/auth/me` | Get current user |
| `GET` | `/auth/google` | Initiate Google OAuth |
| `GET` | `/auth/google/callback` | Google OAuth callback |
| `GET` | `/auth/github` | Initiate GitHub OAuth |
| `GET` | `/auth/github/callback` | GitHub OAuth callback |

### Clients (`/api/clients`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/clients` | List clients (with filters) |
| `POST` | `/clients` | Create client |
| `GET` | `/clients/:id` | Get client details |
| `PUT` | `/clients/:id` | Update client |
| `DELETE` | `/clients/:id` | Delete client |
| `PATCH` | `/clients/:id/digest` | Toggle digest inclusion |
| `GET` | `/clients/:id/notes` | Get client's notes |
| `GET` | `/clients/:id/actions` | Get client's actions |
| `GET` | `/clients/:id/timeline` | Get activity timeline |

### Notes (`/api/notes`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notes` | List notes (with filters) |
| `POST` | `/notes` | Create note |
| `GET` | `/notes/:id` | Get note details |
| `PUT` | `/notes/:id` | Update note |
| `DELETE` | `/notes/:id` | Delete note |
| `POST` | `/notes/:id/analyze` | Trigger AI analysis |

### Actions (`/api/actions`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/actions` | List actions (with filters) |
| `POST` | `/actions` | Create action |
| `GET` | `/actions/:id` | Get action details |
| `PUT` | `/actions/:id` | Update action |
| `DELETE` | `/actions/:id` | Delete action |
| `PATCH` | `/actions/:id/complete` | Mark as complete |

### Radar/Dashboard (`/api/radar`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/radar` | Full dashboard data |
| `GET` | `/radar/attention` | Clients needing attention |
| `GET` | `/radar/commitments` | Open action items |
| `GET` | `/radar/stats` | Dashboard statistics |
| `POST` | `/radar/test-digest` | Send test digest email |

### Settings (`/api/settings`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settings` | Get user settings |
| `PUT` | `/settings` | Update user settings |
| `PUT` | `/settings/digest` | Update digest preferences |

### Billing (`/api/billing`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/billing/status` | Get subscription status |
| `POST` | `/billing/checkout` | Create Stripe checkout |
| `POST` | `/billing/portal` | Create customer portal session |
| `GET` | `/billing/plans` | List available plans |

### Webhooks (`/api/webhooks`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/stripe` | Stripe webhook handler |

---

## Authentication

### Magic Link Flow

```
┌──────────┐    POST /auth/magic-link    ┌──────────┐
│  Client  │ ──────────────────────────► │  Worker  │
│          │                              │          │
│          │    Email with token link     │          │
│          │ ◄─────────────────────────── │          │
│          │                              │          │
│          │    Click link + verify       │          │
│          │ ──────────────────────────► │          │
│          │                              │          │
│          │    Session token             │          │
│          │ ◄─────────────────────────── │          │
└──────────┘                              └──────────┘
```

1. User submits email
2. Worker generates token, hashes it, stores in `magic_links`
3. Email sent via Resend with unhashed token
4. User clicks link, token verified against hash
5. Session created, token stored in localStorage

### OAuth Flow

```
┌──────────┐    /auth/google    ┌──────────┐    ┌──────────┐
│  Client  │ ─────────────────► │  Worker  │ ──►│  Google  │
│          │                    │          │    │          │
│          │    Redirect        │          │    │          │
│          │ ◄───────────────── │          │ ◄──│          │
│          │                    │          │    │          │
│          │    /callback       │          │    │          │
│          │ ─────────────────► │          │    │          │
│          │                    │          │    │          │
│          │    Session token   │          │    │          │
│          │ ◄───────────────── │          │    │          │
└──────────┘                    └──────────┘    └──────────┘
```

### Session Management

- Sessions stored in `sessions` table with hashed tokens
- Client stores unhashed token in localStorage
- Authorization header: `Bearer <token>`
- Sessions expire after 7 days
- Nightly cleanup removes expired sessions

---

## Services

### Digest Service (`worker/src/services/digest.ts`)

Generates and sends daily email digests:

```typescript
generateDigestContent(db, user) → DigestContent
sendDigestEmail(content, env) → { success, emailId, error }
logDigestSend(db, userId, content, emailId)
```

### Cron Service (`worker/src/services/cron.ts`)

Scheduled tasks via Cloudflare Cron Triggers:

| Schedule | Task |
|----------|------|
| `0 * * * *` | Check for due digests |
| `0 2 * * *` | Security cleanup (expired tokens) |
| `0 3 * * *` | Health score recalculation |

### AI/Queue Service (`worker/src/services/queue.ts`)

Asynchronous AI processing:

```typescript
interface AIJob {
  type: 'analyze_note' | 'summarize' | 'extract_actions';
  noteId: string;
  content: string;
}
```

- Uses Cloudflare Workers AI (primary)
- Falls back to Google Gemini
- Extracts: summary, sentiment, key points, action items

### Audit Service (`worker/src/services/audit.ts`)

Security event logging:

```typescript
logAuditEvent(db, {
  userId, action, resourceType, resourceId,
  ipAddress, userAgent, details
})
```

---

## Security

### CSRF Protection

Cross-origin CSRF using session-bound tokens:

1. Session token hashed → KV key
2. CSRF token stored in KV (24h TTL)
3. Token returned in `X-CSRF-Token` header
4. Client stores in localStorage
5. Sent with state-changing requests

### Rate Limiting

Per-IP request throttling:
- KV-based counters
- Configurable limits per endpoint
- Automatic reset after window

### Token Security

- Magic link tokens: SHA-256 hashed before storage
- Session tokens: SHA-256 hashed before storage
- Only hashes stored in database
- Timing-safe comparison for validation

### Audit Logging

All security events logged:
- Login attempts (success/failure)
- OAuth connections
- Session creation/destruction
- Permission changes

---

## Deployment

### Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Pages     │    │   Worker    │    │     D1      │     │
│  │  (Frontend) │───►│   (API)     │───►│  (Database) │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                  │                                 │
│         │           ┌──────┴──────┐                         │
│         │           │             │                         │
│         │      ┌────▼────┐  ┌─────▼─────┐                  │
│         │      │   KV    │  │   Queue   │                  │
│         │      │ (Cache) │  │ (AI Jobs) │                  │
│         │      └─────────┘  └───────────┘                  │
│         │                                                   │
│         └──────────────────────────────────────────────────│
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼─────┐  ┌──────▼──────┐  ┌─────▼─────┐
        │  Resend   │  │   Stripe    │  │  OAuth    │
        │  (Email)  │  │  (Billing)  │  │ Providers │
        └───────────┘  └─────────────┘  └───────────┘
```

### Environment Variables

**Set in `wrangler.toml`:**
```toml
[vars]
ENVIRONMENT = "production"
APP_URL = "https://clientpulse.pages.dev"
API_URL = "https://clientpulse-api.sfraser.workers.dev"
FROM_EMAIL = "ClientPulse <onboarding@resend.dev>"
GEMINI_MODEL = "gemini-1.5-flash"
```

**Set via `wrangler secret put`:**
```
SESSION_SECRET      # Session signing key
RESEND_API_KEY      # Email service
GEMINI_API_KEY      # AI fallback
STRIPE_SECRET_KEY   # Payment processing
STRIPE_WEBHOOK_SECRET  # Webhook validation
```

### Bindings

```toml
# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "clientpulse"

# KV Cache
[[kv_namespaces]]
binding = "CACHE"

# Queue
[[queues.producers]]
queue = "ai-processing-queue"
binding = "AI_QUEUE"

# Workers AI
[ai]
binding = "AI"
```

### Deployment Commands

```bash
# Deploy worker
cd worker
wrangler deploy

# Deploy frontend
cd ..
npm run build
wrangler pages deploy dist

# Run migrations
wrangler d1 execute clientpulse --file=worker/src/db/migrations/XXX.sql --remote

# Set secrets
wrangler secret put RESEND_API_KEY
```

---

## Appendix

### Health Score Calculation

Clients are scored 0-100 based on:
- Days since last contact (negative impact)
- Open action items (negative impact)
- Overdue actions (strong negative impact)
- Recent positive sentiment (positive impact)
- Meeting frequency (positive impact)

### Digest Email Content

Daily digests include:
- Clients with recent activity
- New notes from last 24 hours
- AI-generated summaries
- Open action items
- Overdue commitments

### Plan Tiers

| Plan | Features |
|------|----------|
| Free | 5 clients, basic features |
| Pro | Up to 500 clients, AI analysis, digests |
| Team | Multi-user, shared clients |
