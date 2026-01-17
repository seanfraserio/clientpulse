# ClientPulse Architecture Review

**Reviewer**: Architect Agent
**Date**: January 17, 2026
**Status**: Initial Review
**PRD Version**: 1.0

---

## Executive Summary

The ClientPulse PRD presents a well-structured product vision with solid technical foundations. The Cloudflare-native stack is an excellent choice for cost efficiency and global performance. However, several architectural concerns should be addressed before implementation to avoid technical debt and ensure scalability.

**Overall Assessment**: ✅ **Approved with Recommendations**

| Area | Rating | Notes |
|------|--------|-------|
| Tech Stack | ⭐⭐⭐⭐⭐ | Excellent - Cloudflare free tier is well-suited |
| Database Schema | ⭐⭐⭐⭐ | Good - Minor normalization and indexing improvements |
| API Design | ⭐⭐⭐⭐ | Good - Some endpoints need refinement |
| Health Algorithm | ⭐⭐⭐⭐⭐ | Excellent - Well-designed, explainable |
| AI Pipeline | ⭐⭐⭐ | Needs work - Reliability and fallback concerns |
| Security | ⭐⭐⭐ | Needs work - Session management gaps |

---

## 1. Tech Stack Review

### ✅ Strengths

| Choice | Rationale | Verdict |
|--------|-----------|---------|
| Cloudflare Workers | Edge-native, free tier generous, D1+AI+Vectorize integration | Excellent |
| Astro 5 | Fast, islands architecture fits dashboard pattern | Excellent |
| D1 (SQLite) | Simple, sufficient for MVP, migrations supported | Good |
| Magic Link Auth | Reduces complexity vs OAuth, good UX | Good |
| Hono Router | Lightweight, Workers-native, TypeScript-first | Excellent |

### ⚠️ Concerns

#### 1.1 React 19 + Tailwind v4 Risk
**Issue**: Both are very new (React 19 stable Dec 2024, Tailwind v4 Jan 2025). Ecosystem compatibility may be unstable.

**Recommendation**:
```
Option A (Conservative): Use React 18.3 + Tailwind v3.4 for stability
Option B (Current): Proceed with v19/v4 but budget extra time for library issues
```

**Decision Needed**: Which approach do you prefer?

#### 1.2 Workers AI Model Selection
**Issue**: Spec uses `@cf/meta/llama-3.1-8b-instruct` which is good, but JSON extraction reliability varies.

**Recommendation**:
- Add structured output validation (Zod)
- Implement retry logic with exponential backoff
- Consider fallback to `@cf/mistral/mistral-7b-instruct-v0.1` if Llama fails

#### 1.3 Resend Dependency
**Issue**: External dependency for critical path (magic links). If Resend is down, users can't log in.

**Mitigation**:
- Implement email queue with retry (not blocking auth flow)
- Consider Cloudflare Email Workers as backup
- Add rate limiting to prevent abuse

---

## 2. Database Schema Review

### ✅ Well-Designed Elements

- UUID primary keys via `randomblob(16)` - good for distributed systems
- Soft deletes with `archived_at` - supports recovery
- JSON columns for flexible arrays (tags, signals) - appropriate for D1
- Good indexing on hot paths (user_id, health_status, due_date)

### ⚠️ Issues to Address

#### 2.1 Missing Indexes

```sql
-- Add these indexes for common query patterns
CREATE INDEX idx_clients_status ON clients(user_id, status);
CREATE INDEX idx_notes_type ON notes(user_id, note_type);
CREATE INDEX idx_actions_owner ON action_items(user_id, owner, status);
```

#### 2.2 `clients.tags` JSON Column
**Issue**: Filtering by tags requires JSON parsing, slow for queries like "all clients tagged 'retainer'".

**Options**:
```
Option A: Keep JSON, add computed column or search at app layer
Option B: Create separate client_tags junction table
Option C: Use D1's json_each() for queries (acceptable for MVP scale)
```

**Recommendation**: Option C for MVP, migrate to Option B if performance issues arise.

#### 2.3 Health Snapshot Retention
**Issue**: No cleanup strategy. 1 snapshot/day/client = ~5,500 rows/year for 15 clients.

**Recommendation**:
- Keep daily snapshots for 90 days
- Aggregate to weekly after 90 days
- Add cron job for cleanup

```sql
-- Cleanup query (run weekly)
DELETE FROM health_snapshots
WHERE snapshot_date < date('now', '-90 days')
  AND id NOT IN (
    SELECT MIN(id) FROM health_snapshots
    WHERE snapshot_date < date('now', '-90 days')
    GROUP BY client_id, strftime('%Y-%W', snapshot_date)
  );
```

#### 2.4 Missing `updated_at` Trigger
**Issue**: `updated_at` columns exist but won't auto-update without triggers.

**Solution**: Add trigger for each table:
```sql
CREATE TRIGGER update_clients_timestamp
AFTER UPDATE ON clients
BEGIN
  UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

---

## 3. API Design Review

### ✅ Strengths

- RESTful conventions followed
- Resource-oriented endpoints
- Good separation of concerns

### ⚠️ Issues to Address

#### 3.1 Missing Pagination
**Issue**: `GET /api/clients` and `GET /api/notes` have no pagination params.

**Recommendation**:
```typescript
// Add to all list endpoints
interface PaginationParams {
  limit?: number;   // default 50, max 100
  cursor?: string;  // for cursor-based pagination
  sort?: string;    // field to sort by
  order?: 'asc' | 'desc';
}

// Response envelope
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    cursor?: string;
    hasMore: boolean;
  };
}
```

#### 3.2 Radar Endpoint Efficiency
**Issue**: `GET /api/radar` likely requires multiple DB queries (attention clients, watch clients, healthy clients, commitments).

**Recommendation**: Create a single optimized query:
```sql
SELECT
  c.*,
  COUNT(ai.id) FILTER (WHERE ai.status = 'open' AND ai.owner = 'me') as open_commitments,
  COUNT(ai.id) FILTER (WHERE ai.status = 'open' AND ai.due_date < date('now')) as overdue
FROM clients c
LEFT JOIN action_items ai ON ai.client_id = c.id
WHERE c.user_id = ?
GROUP BY c.id
ORDER BY
  CASE c.health_status WHEN 'attention' THEN 1 WHEN 'watch' THEN 2 ELSE 3 END,
  c.health_score ASC;
```

#### 3.3 Rate Limiting Missing
**Issue**: No rate limiting specified for auth endpoints.

**Recommendation**:
```typescript
// Auth endpoints
const authLimits = {
  'POST /api/auth/magic-link': { requests: 5, window: '1h' },  // Prevent email spam
  'GET /api/auth/verify': { requests: 10, window: '5m' },       // Prevent token brute-force
};

// General API
const apiLimits = {
  authenticated: { requests: 1000, window: '1h' },
  search: { requests: 100, window: '1h' },  // Vectorize is expensive
};
```

#### 3.4 Webhook Support (Future)
**Issue**: No webhook/integration endpoints for future expansion.

**Recommendation**: Reserve namespace:
```
POST /api/integrations/inbound    # For future calendar/email integrations
POST /api/webhooks/:provider      # For OAuth callbacks later
```

---

## 4. AI/ML Pipeline Review

### ⚠️ Critical Issues

#### 4.1 No Error Handling for AI Failures
**Issue**: `processNote()` pipeline assumes AI always returns valid JSON.

**Problem Scenario**:
1. User creates note
2. AI call times out or returns malformed JSON
3. Note processing fails
4. User sees error, data potentially lost

**Recommended Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                    NOTE PROCESSING PIPELINE                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │  SAVE   │───▶│  QUEUE  │───▶│   AI    │───▶│ UPDATE  │  │
│  │  NOTE   │    │  ASYNC  │    │ PROCESS │    │  NOTE   │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│       │              │              │              │        │
│       ▼              ▼              ▼              ▼        │
│   [Immediate]   [Non-blocking]  [Retry 3x]   [Eventually]   │
│   [Response]    [Background]    [Backoff]    [Consistent]   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```typescript
async function createNote(note: NoteInput): Promise<Note> {
  // 1. Save note immediately (user gets instant feedback)
  const savedNote = await db.insert('notes', {
    ...note,
    ai_status: 'pending'  // Add this column
  });

  // 2. Queue AI processing (non-blocking)
  await queue.send({
    type: 'PROCESS_NOTE',
    noteId: savedNote.id,
    attempt: 1
  });

  // 3. Return immediately
  return savedNote;
}

// Queue consumer (separate handler)
async function processNoteQueue(msg: QueueMessage) {
  try {
    const result = await processNoteWithAI(msg.noteId);
    await db.update('notes', msg.noteId, {
      ...result,
      ai_status: 'completed'
    });
  } catch (error) {
    if (msg.attempt < 3) {
      // Retry with exponential backoff
      await queue.send({
        ...msg,
        attempt: msg.attempt + 1
      }, { delaySeconds: Math.pow(2, msg.attempt) * 60 });
    } else {
      // Mark as failed, allow manual retry
      await db.update('notes', msg.noteId, {
        ai_status: 'failed',
        ai_error: error.message
      });
    }
  }
}
```

**Schema Addition**:
```sql
ALTER TABLE notes ADD COLUMN ai_status TEXT
  DEFAULT 'pending'
  CHECK (ai_status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE notes ADD COLUMN ai_error TEXT;
```

#### 4.2 Vectorize Cold Start
**Issue**: New users have no embeddings. Semantic search will return empty until they add notes.

**Recommendation**:
- Show "Add more notes to enable smart search" message
- Fallback to keyword search when <5 notes exist
- Pre-populate with sample data for onboarding (optional)

#### 4.3 AI Output Validation
**Issue**: LLM outputs are unpredictable. Need strict validation.

**Recommendation**: Use Zod for runtime validation:
```typescript
import { z } from 'zod';

const AIAnalysisSchema = z.object({
  summary: z.string().max(500),
  action_items: z.array(z.object({
    description: z.string(),
    owner: z.enum(['me', 'client']),
    due_hint: z.enum(['today', 'this week', 'next week', 'no specific date'])
  })).max(10),
  risk_signals: z.array(z.string()).max(5),
  personal_details: z.array(z.string()).max(5),
  sentiment_score: z.number().min(-1).max(1),
  topics: z.array(z.string()).max(10)
});

async function parseAIResponse(response: string): Promise<AIAnalysis> {
  const parsed = JSON.parse(response);
  return AIAnalysisSchema.parse(parsed); // Throws if invalid
}
```

---

## 5. Security Review

### ⚠️ Issues to Address

#### 5.1 Session Token Storage
**Issue**: Spec doesn't specify where session tokens are stored client-side.

**Recommendation**: HTTP-only cookies with proper flags:
```typescript
// After magic link verification
const sessionToken = generateSecureToken();

return new Response(null, {
  status: 302,
  headers: {
    'Location': '/dashboard',
    'Set-Cookie': [
      `session=${sessionToken}`,
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      `Max-Age=${7 * 24 * 60 * 60}`,  // 7 days
      'Path=/'
    ].join('; ')
  }
});
```

#### 5.2 Magic Link Token Entropy
**Issue**: Token generation not specified.

**Recommendation**:
```typescript
import { randomBytes } from 'crypto';

function generateMagicLinkToken(): string {
  return randomBytes(32).toString('base64url'); // 256 bits of entropy
}
```

#### 5.3 User Data Isolation
**Issue**: Every query must filter by `user_id`. Easy to miss.

**Recommendation**: Create helper that enforces tenant isolation:
```typescript
class DB {
  constructor(private userId: string, private d1: D1Database) {}

  async getClient(clientId: string): Promise<Client | null> {
    const result = await this.d1.prepare(
      'SELECT * FROM clients WHERE id = ? AND user_id = ?'
    ).bind(clientId, this.userId).first();
    return result;
  }

  // All queries automatically include user_id filter
}
```

#### 5.4 Input Sanitization
**Issue**: Meeting notes contain user-generated text that's concatenated into AI prompts.

**Risk**: Prompt injection attacks.

**Mitigation**:
```typescript
function sanitizeForPrompt(text: string): string {
  // Remove potential prompt injection patterns
  return text
    .replace(/\[INST\]/gi, '')
    .replace(/<<SYS>>/gi, '')
    .replace(/system:/gi, '')
    .substring(0, 5000); // Limit length
}
```

---

## 6. Scalability Considerations

### Current Design Limits

| Resource | Free Tier Limit | Bottleneck At | Mitigation |
|----------|-----------------|---------------|------------|
| Workers Requests | 100K/day | ~1K active users | Upgrade to Workers Paid |
| D1 Reads | 5M/day | ~500 users | Add caching layer |
| Workers AI | 10K neurons/day | ~200 notes/day | Batch processing, reduce prompts |
| Vectorize | 5M vectors | ~500K notes | Archive old embeddings |

### Recommended Caching Strategy

```typescript
// Use Workers KV for frequently accessed data
interface CacheConfig {
  'radar:{userId}': { ttl: 60 },         // 1 minute
  'client:{clientId}': { ttl: 300 },     // 5 minutes
  'health:{clientId}': { ttl: 300 },     // 5 minutes
}

async function getRadar(userId: string): Promise<RadarData> {
  const cached = await KV.get(`radar:${userId}`, 'json');
  if (cached) return cached;

  const fresh = await buildRadarData(userId);
  await KV.put(`radar:${userId}`, JSON.stringify(fresh), { expirationTtl: 60 });
  return fresh;
}
```

---

## 7. Recommended Architecture Decisions

### ADR-001: Asynchronous AI Processing

**Status**: Proposed

**Context**: AI processing is slow (1-3s) and unreliable. Synchronous processing degrades UX.

**Decision**: Process AI asynchronously using Cloudflare Queues. Notes save immediately; AI enrichment happens in background.

**Consequences**:
- (+) Instant feedback for users
- (+) Graceful degradation if AI fails
- (-) Notes show "AI processing..." status temporarily
- (-) Slightly more complex architecture

---

### ADR-002: Session Management via HTTP-Only Cookies

**Status**: Proposed

**Context**: Need secure session storage for magic link auth.

**Decision**: Store session tokens in HTTP-only, Secure, SameSite=Strict cookies. 7-day expiry.

**Consequences**:
- (+) XSS attacks can't steal tokens
- (+) Automatic transmission with requests
- (-) CSRF protection needed (SameSite helps)
- (-) No cross-domain session sharing

---

### ADR-003: Hybrid Search (Keyword + Semantic)

**Status**: Proposed

**Context**: Vectorize semantic search is powerful but needs minimum data. New users have no embeddings.

**Decision**: Implement hybrid search:
1. If <5 notes exist, use SQLite LIKE queries only
2. If ≥5 notes, combine SQLite keyword matches with Vectorize semantic results
3. Rank by weighted combination

**Consequences**:
- (+) Works from day 1
- (+) Better results with combined signals
- (-) More complex search logic

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AI returns malformed JSON | High | Medium | Zod validation + retry logic |
| Resend outage blocks login | Low | High | Email queue with retry |
| D1 performance at scale | Medium | High | Add KV caching layer |
| React 19/Tailwind v4 bugs | Medium | Medium | Test thoroughly, have fallback versions |
| Prompt injection in notes | Low | Medium | Sanitize inputs before AI prompts |
| User data leak via missing tenant filter | Low | Critical | DB helper enforces user_id filter |

---

## 9. Implementation Recommendations

### Before Starting Phase 1

1. **Decide on React/Tailwind versions** (see 1.1)
2. **Add async AI processing** (see 4.1) - add to Phase 1 scope
3. **Add missing schema elements**:
   - `notes.ai_status` column
   - `updated_at` triggers
   - Additional indexes

### Phase 1 Additions

```diff
  Phase 1: Foundation (Days 1-5)
  - [ ] Initialize Astro project with React and Tailwind v4
  - [ ] Set up Cloudflare Worker with Hono router
  - [ ] Create D1 database with full schema
+ - [ ] Set up Cloudflare Queues for async processing
+ - [ ] Implement rate limiting on auth endpoints
  - [ ] Implement magic link authentication flow
+ - [ ] Add session cookie handling (HTTP-only)
  - [ ] Build basic Layout and navigation components
  - [ ] Create landing page
  - [ ] Deploy to Cloudflare Pages + Workers
```

### Phase 3 Additions

```diff
  Phase 3: The Radar (Days 11-15)
  - [ ] Implement health calculation algorithm
  - [ ] Create health_snapshots for trend tracking
+ - [ ] Add health snapshot cleanup cron
  - [ ] Build RadarDashboard component
  - [ ] Build ClientHealthCard with signals display
  - [ ] Create SuggestedAction component
  - [ ] Add CommitmentsList to dashboard
  - [ ] Connect AI for note analysis
+ - [ ] Add AI response validation (Zod schemas)
+ - [ ] Implement fallback for AI failures
```

---

## 10. Next Steps

1. **Review this document** - Confirm recommendations or discuss alternatives
2. **Update PRD** - Incorporate approved changes
3. **Create ADR folder** - Document decisions formally
4. **Proceed to Phase 1** - With updated scope

---

**Reviewed by**: Architect Agent
**Handoff to**: Engineer Agent (after approval)
