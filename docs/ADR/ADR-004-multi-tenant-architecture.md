# ADR-004: Multi-Tenant Architecture

## Status
**Accepted** - January 17, 2026

## Context
ClientPulse is a SaaS application where multiple users (tenants) share the same infrastructure. Each user's data must be completely isolated from other users. A single query missing a `user_id` filter could expose sensitive client relationship data.

## Decision

Implement **row-level multi-tenancy** with enforced tenant isolation at the data access layer.

### 1. Database Design (Row-Level Tenancy)

All tenant-scoped tables include `user_id` as a required foreign key:

```sql
-- Every tenant-scoped table follows this pattern
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ... other columns
);

-- Composite indexes for tenant-scoped queries
CREATE INDEX idx_clients_user ON clients(user_id);
CREATE INDEX idx_clients_user_status ON clients(user_id, status);
```

### 2. Tenant-Aware Database Layer

**Never** access the database directly. Always use the tenant-aware wrapper:

```typescript
// worker/src/db/tenant-db.ts

import { D1Database } from '@cloudflare/workers-types';

/**
 * Tenant-isolated database wrapper.
 * All queries automatically include user_id filtering.
 * Direct D1 access should be avoided in application code.
 */
export class TenantDB {
  constructor(
    private readonly db: D1Database,
    private readonly userId: string
  ) {
    if (!userId) {
      throw new Error('TenantDB requires userId');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CLIENTS
  // ═══════════════════════════════════════════════════════════

  async getClient(clientId: string): Promise<Client | null> {
    const result = await this.db.prepare(`
      SELECT * FROM clients
      WHERE id = ? AND user_id = ?
    `).bind(clientId, this.userId).first<Client>();

    return result;
  }

  async listClients(options: ListOptions = {}): Promise<Client[]> {
    const { status = 'active', limit = 50, cursor } = options;

    let query = `
      SELECT * FROM clients
      WHERE user_id = ? AND status = ?
    `;
    const params: any[] = [this.userId, status];

    if (cursor) {
      query += ` AND id > ?`;
      params.push(cursor);
    }

    query += ` ORDER BY name ASC LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query)
      .bind(...params)
      .all<Client>();

    return result.results;
  }

  async createClient(data: CreateClientInput): Promise<Client> {
    const id = generateId();

    await this.db.prepare(`
      INSERT INTO clients (id, user_id, name, company, email, role, tags, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).bind(
      id,
      this.userId,  // Always inject current user
      data.name,
      data.company || null,
      data.email || null,
      data.role || null,
      JSON.stringify(data.tags || [])
    ).run();

    // Increment user's client count
    await this.db.prepare(`
      UPDATE users SET clients_count = clients_count + 1 WHERE id = ?
    `).bind(this.userId).run();

    return this.getClient(id) as Promise<Client>;
  }

  async updateClient(clientId: string, data: UpdateClientInput): Promise<Client | null> {
    // First verify ownership
    const existing = await this.getClient(clientId);
    if (!existing) {
      return null; // Client doesn't exist or doesn't belong to user
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.company !== undefined) {
      updates.push('company = ?');
      params.push(data.company);
    }
    // ... other fields

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(clientId, this.userId);

    await this.db.prepare(`
      UPDATE clients
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).bind(...params).run();

    return this.getClient(clientId);
  }

  async deleteClient(clientId: string): Promise<boolean> {
    // Soft delete with ownership check
    const result = await this.db.prepare(`
      UPDATE clients
      SET status = 'archived', archived_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(clientId, this.userId).run();

    return result.meta.changes > 0;
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  async getNote(noteId: string): Promise<Note | null> {
    return this.db.prepare(`
      SELECT * FROM notes
      WHERE id = ? AND user_id = ?
    `).bind(noteId, this.userId).first<Note>();
  }

  async listNotes(options: ListNotesOptions = {}): Promise<Note[]> {
    const { clientId, limit = 50, cursor } = options;

    let query = `SELECT * FROM notes WHERE user_id = ?`;
    const params: any[] = [this.userId];

    if (clientId) {
      query += ` AND client_id = ?`;
      params.push(clientId);
    }

    if (cursor) {
      query += ` AND created_at < ?`;
      params.push(cursor);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all<Note>();
    return result.results;
  }

  async createNote(data: CreateNoteInput): Promise<Note> {
    // Verify client belongs to user first
    const client = await this.getClient(data.clientId);
    if (!client) {
      throw new TenantError('Client not found or access denied');
    }

    const id = generateId();

    await this.db.prepare(`
      INSERT INTO notes (
        id, user_id, client_id, note_type, title, meeting_date,
        summary, discussed, decisions, action_items_raw, concerns,
        personal_notes, next_steps, mood, ai_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      id,
      this.userId,
      data.clientId,
      data.noteType || 'meeting',
      data.title || null,
      data.meetingDate || null,
      data.summary || null,
      data.discussed || null,
      data.decisions || null,
      data.actionItemsRaw || null,
      data.concerns || null,
      data.personalNotes || null,
      data.nextSteps || null,
      data.mood || 'neutral'
    ).run();

    // Update client's last contact
    await this.db.prepare(`
      UPDATE clients
      SET last_contact_at = CURRENT_TIMESTAMP,
          total_meetings = total_meetings + 1
      WHERE id = ? AND user_id = ?
    `).bind(data.clientId, this.userId).run();

    // Increment user's note count
    await this.db.prepare(`
      UPDATE users SET notes_count = notes_count + 1 WHERE id = ?
    `).bind(this.userId).run();

    return this.getNote(id) as Promise<Note>;
  }

  // ═══════════════════════════════════════════════════════════
  // ACTION ITEMS
  // ═══════════════════════════════════════════════════════════

  async listActions(options: ListActionsOptions = {}): Promise<ActionItem[]> {
    const { status = 'open', owner, clientId, limit = 100 } = options;

    let query = `SELECT * FROM action_items WHERE user_id = ?`;
    const params: any[] = [this.userId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (owner) {
      query += ` AND owner = ?`;
      params.push(owner);
    }
    if (clientId) {
      query += ` AND client_id = ?`;
      params.push(clientId);
    }

    query += ` ORDER BY due_date ASC NULLS LAST LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all<ActionItem>();
    return result.results;
  }

  async getOverdueActions(): Promise<ActionItem[]> {
    const result = await this.db.prepare(`
      SELECT * FROM action_items
      WHERE user_id = ?
        AND status = 'open'
        AND owner = 'me'
        AND due_date < date('now')
      ORDER BY due_date ASC
    `).bind(this.userId).all<ActionItem>();

    return result.results;
  }

  // ═══════════════════════════════════════════════════════════
  // RADAR (Aggregated Dashboard Data)
  // ═══════════════════════════════════════════════════════════

  async getRadarData(): Promise<RadarData> {
    // Single optimized query for dashboard
    const clients = await this.db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM action_items ai
         WHERE ai.client_id = c.id AND ai.status = 'open' AND ai.owner = 'me')
         as open_commitments,
        (SELECT COUNT(*) FROM action_items ai
         WHERE ai.client_id = c.id AND ai.status = 'open'
         AND ai.owner = 'me' AND ai.due_date < date('now'))
         as overdue_count
      FROM clients c
      WHERE c.user_id = ? AND c.status = 'active'
      ORDER BY
        CASE c.health_status
          WHEN 'attention' THEN 1
          WHEN 'watch' THEN 2
          ELSE 3
        END,
        c.health_score ASC
    `).bind(this.userId).all<ClientWithStats>();

    const attention = clients.results.filter(c => c.health_status === 'attention');
    const watch = clients.results.filter(c => c.health_status === 'watch');
    const healthy = clients.results.filter(c => c.health_status === 'healthy');

    const overdueActions = await this.getOverdueActions();

    return {
      attention,
      watch,
      healthy,
      overdueActions,
      stats: {
        totalClients: clients.results.length,
        needsAttention: attention.length,
        openCommitments: overdueActions.length
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════
// CUSTOM ERRORS
// ═══════════════════════════════════════════════════════════

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
  }
}
```

### 3. Middleware Integration

```typescript
// worker/src/middleware/auth.ts

import { Context, Next } from 'hono';
import { TenantDB } from '../db/tenant-db';

export async function authMiddleware(c: Context, next: Next) {
  const sessionToken = c.req.cookie('session');

  if (!sessionToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Validate session and get user
  const session = await c.env.DB.prepare(`
    SELECT u.* FROM users u
    JOIN auth_tokens t ON t.user_id = u.id
    WHERE t.token = ? AND t.type = 'session' AND t.expires_at > datetime('now')
  `).bind(sessionToken).first<User>();

  if (!session) {
    return c.json({ error: 'Session expired' }, 401);
  }

  // Inject tenant-aware DB into context
  c.set('user', session);
  c.set('db', new TenantDB(c.env.DB, session.id));

  await next();
}

// Usage in routes
app.get('/api/clients', authMiddleware, async (c) => {
  const db = c.get('db') as TenantDB;
  const clients = await db.listClients();
  return c.json({ data: clients });
});
```

### 4. Cross-Tenant Access Prevention

```typescript
// Additional safeguards

// 1. Vectorize queries must include user filter
async function searchNotes(userId: string, query: string): Promise<Note[]> {
  const embedding = await generateEmbedding(query);

  const results = await env.NOTES_INDEX.query(embedding, {
    topK: 20,
    filter: {
      user_id: userId  // CRITICAL: Always filter by user
    }
  });

  return results.matches.map(m => m.metadata);
}

// 2. Queue messages must include userId for processing
interface QueueMessage {
  userId: string;  // Required for tenant context
  noteId: string;
  // ...
}

// 3. Cron jobs iterate per-user
async function dailyDigestCron() {
  const users = await db.prepare(`
    SELECT * FROM users WHERE daily_digest_enabled = TRUE
  `).all<User>();

  for (const user of users.results) {
    const tenantDb = new TenantDB(db, user.id);
    const radarData = await tenantDb.getRadarData();
    await sendDigestEmail(user, radarData);
  }
}
```

## Consequences

### Positive
- Complete data isolation between users
- Single query pattern prevents accidental cross-tenant access
- Scales well for SaaS model
- Easy to audit data access patterns

### Negative
- Slightly more verbose code (must use TenantDB wrapper)
- Can't easily query across all users (admin features need separate path)
- Performance: Every query includes user_id filter (mitigated by indexes)

### Audit Trail
Consider adding audit logging for sensitive operations:

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,  -- 'create_client', 'delete_note', etc.
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,  -- JSON
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Checklist

- [ ] Create TenantDB class
- [ ] Update all route handlers to use TenantDB
- [ ] Add user_id filter to Vectorize queries
- [ ] Include userId in all queue messages
- [ ] Add composite indexes for tenant + common filters
- [ ] Implement audit logging (optional, Phase 2)
