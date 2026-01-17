import { Hono } from 'hono';
import { z } from 'zod';
import { TenantDB } from '../db/tenant-db';
import type { AppEnv } from '../index';
import type { User, AIProcessingMessage } from '@shared/types';

const notes = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const CreateNoteSchema = z.object({
  clientId: z.string().regex(/^[a-f0-9]{32}$/),
  noteType: z.enum(['meeting', 'quick', 'email', 'call']).default('meeting'),
  title: z.string().max(200).trim().nullish(),
  // Accept YYYY-MM-DD date format from HTML date input
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  meetingType: z.enum(['meeting', 'call', 'email', 'chat', 'video_call', 'phone', 'in_person', 'async', 'other']).nullish(),
  durationMinutes: z.number().int().min(1).max(600).nullish(),
  attendees: z.array(z.string().max(100)).max(20).optional(),
  summary: z.string().max(1000).trim().nullish(),
  discussed: z.string().max(5000).trim().nullish(),
  decisions: z.string().max(2000).trim().nullish(),
  actionItemsRaw: z.string().max(2000).trim().nullish(),
  concerns: z.string().max(2000).trim().nullish(),
  personalNotes: z.string().max(2000).trim().nullish(),
  nextSteps: z.string().max(2000).trim().nullish(),
  mood: z.enum(['positive', 'neutral', 'negative', 'concerned', 'frustrated']).default('neutral')
});

const UpdateNoteSchema = CreateNoteSchema.partial().omit({ clientId: true });

// ═══════════════════════════════════════════════════════════
// GET /api/notes - List notes
// ═══════════════════════════════════════════════════════════

notes.get('/', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.query('clientId');
  const limit = parseInt(c.req.query('limit') || '50');
  const cursor = c.req.query('cursor');

  const noteList = await db.listNotes({
    clientId,
    limit: Math.min(limit, 100),
    cursor
  });

  return c.json({
    data: noteList,
    meta: {
      hasMore: noteList.length === limit,
      cursor: noteList.length > 0 ? noteList[noteList.length - 1].created_at : undefined
    }
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/notes - Create new note
// ═══════════════════════════════════════════════════════════

notes.post('/', async (c) => {
  const db = c.get('db') as TenantDB;
  const user = c.get('user') as User;
  const body = await c.req.json();

  // Validate input
  const parsed = CreateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }, 400);
  }

  // Check monthly note limit
  const { getTierByPlan } = await import('@shared/billing');
  const tier = getTierByPlan(user.plan);
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  const usageResult = await c.env.DB.prepare(`
    SELECT notes_created FROM usage_tracking
    WHERE user_id = ? AND period = ?
  `).bind(user.id, period).first<{ notes_created: number }>();

  const notesThisMonth = usageResult?.notes_created || 0;

  if (notesThisMonth >= tier.limits.maxNotesPerMonth) {
    return c.json({
      error: 'Monthly note limit reached',
      limit: tier.limits.maxNotesPerMonth,
      resets: getNextMonth(),
      upgrade_url: '/settings/billing'
    }, 403);
  }

  // Create note
  const note = await db.createNote(parsed.data);

  // Update usage tracking
  const { generateId } = await import('../utils/crypto');
  await c.env.DB.prepare(`
    INSERT INTO usage_tracking (id, user_id, period, notes_created)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, period) DO UPDATE SET
      notes_created = notes_created + 1,
      updated_at = CURRENT_TIMESTAMP
  `).bind(generateId(), user.id, period).run();

  // Queue AI processing (non-blocking)
  try {
    const message: AIProcessingMessage = {
      type: 'PROCESS_NOTE',
      noteId: note.id,
      userId: user.id,
      attempt: 1,
      provider: 'cloudflare',
      timestamp: Date.now()
    };

    await c.env.AI_QUEUE.send(message);
  } catch (error) {
    console.error('Failed to queue AI processing:', error);
    // Continue anyway - note was saved successfully
  }

  return c.json({ data: note }, 201);
});

// ═══════════════════════════════════════════════════════════
// GET /api/notes/:id - Get note details
// ═══════════════════════════════════════════════════════════

notes.get('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const noteId = c.req.param('id');

  const note = await db.getNote(noteId);
  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  return c.json({ data: note });
});

// ═══════════════════════════════════════════════════════════
// PUT /api/notes/:id - Update note
// ═══════════════════════════════════════════════════════════

notes.put('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const user = c.get('user') as User;
  const noteId = c.req.param('id');
  const body = await c.req.json();

  // Validate input
  const parsed = UpdateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }, 400);
  }

  // Get existing note
  const existing = await db.getNote(noteId);
  if (!existing) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Build update query
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      updates.push(`${dbKey} = ?`);
      params.push(Array.isArray(value) ? JSON.stringify(value) : value);
    }
  }

  if (updates.length === 0) {
    return c.json({ data: existing });
  }

  // Reset AI status if content changed
  const contentFields = ['summary', 'discussed', 'decisions', 'actionItemsRaw', 'concerns', 'personalNotes', 'nextSteps'];
  const contentChanged = contentFields.some(f => parsed.data[f as keyof typeof parsed.data] !== undefined);

  if (contentChanged) {
    updates.push('ai_status = ?');
    params.push('pending');
  }

  params.push(noteId, user.id);

  await c.env.DB.prepare(`
    UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).bind(...params).run();

  // Re-queue AI processing if content changed
  if (contentChanged) {
    try {
      const message: AIProcessingMessage = {
        type: 'PROCESS_NOTE',
        noteId: noteId,
        userId: user.id,
        attempt: 1,
        provider: 'cloudflare',
        timestamp: Date.now()
      };
      await c.env.AI_QUEUE.send(message);
    } catch (error) {
      console.error('Failed to queue AI processing:', error);
    }
  }

  const updated = await db.getNote(noteId);
  return c.json({ data: updated });
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/notes/:id - Delete note
// ═══════════════════════════════════════════════════════════

notes.delete('/:id', async (c) => {
  const user = c.get('user') as User;
  const noteId = c.req.param('id');

  const result = await c.env.DB.prepare(`
    DELETE FROM notes WHERE id = ? AND user_id = ?
  `).bind(noteId, user.id).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Note not found' }, 404);
  }

  // Decrement user's note count
  await c.env.DB.prepare(`
    UPDATE users SET notes_count = notes_count - 1 WHERE id = ? AND notes_count > 0
  `).bind(user.id).run();

  return c.json({ message: 'Note deleted' });
});

// ═══════════════════════════════════════════════════════════
// POST /api/notes/:id/retry-ai - Retry AI processing
// ═══════════════════════════════════════════════════════════

notes.post('/:id/retry-ai', async (c) => {
  const db = c.get('db') as TenantDB;
  const user = c.get('user') as User;
  const noteId = c.req.param('id');

  const note = await db.getNote(noteId);
  if (!note) {
    return c.json({ error: 'Note not found' }, 404);
  }

  if (note.ai_status !== 'failed') {
    return c.json({ error: 'Note is not in failed state' }, 400);
  }

  // Reset AI status
  await c.env.DB.prepare(`
    UPDATE notes SET ai_status = 'pending', ai_error = NULL WHERE id = ?
  `).bind(noteId).run();

  // Queue for processing
  const message: AIProcessingMessage = {
    type: 'PROCESS_NOTE',
    noteId: noteId,
    userId: user.id,
    attempt: 1,
    provider: 'cloudflare',
    timestamp: Date.now()
  };

  await c.env.AI_QUEUE.send(message);

  return c.json({ message: 'AI processing queued' });
});

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

export default notes;
