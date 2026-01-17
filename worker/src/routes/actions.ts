import { Hono } from 'hono';
import { z } from 'zod';
import { TenantDB } from '../db/tenant-db';
import { isValidId, parseLimit } from '../utils/validation';
import type { AppEnv } from '../index';
import type { User } from '@shared/types';

const actions = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const CreateActionSchema = z.object({
  clientId: z.string().regex(/^[a-f0-9]{32}$/),
  noteId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
  description: z.string().min(1).max(500).trim(),
  owner: z.enum(['me', 'client']).default('me'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const UpdateActionSchema = z.object({
  description: z.string().min(1).max(500).trim().optional(),
  owner: z.enum(['me', 'client']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['open', 'completed', 'cancelled']).optional()
});

// ═══════════════════════════════════════════════════════════
// GET /api/actions - List all action items
// ═══════════════════════════════════════════════════════════

actions.get('/', async (c) => {
  const db = c.get('db') as TenantDB;
  const status = c.req.query('status');
  const owner = c.req.query('owner');
  const clientId = c.req.query('clientId');
  const limit = parseLimit(c.req.query('limit'), 100, 200);

  // Validate clientId if provided
  if (clientId && !isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  // Validate status if provided
  if (status && !['open', 'completed', 'cancelled'].includes(status)) {
    return c.json({ error: 'Invalid status parameter' }, 400);
  }

  // Validate owner if provided
  if (owner && !['me', 'client'].includes(owner)) {
    return c.json({ error: 'Invalid owner parameter' }, 400);
  }

  const actionList = await db.listActions({
    status,
    owner,
    clientId,
    limit
  });

  return c.json({ data: actionList });
});

// ═══════════════════════════════════════════════════════════
// GET /api/actions/open - List open action items only
// ═══════════════════════════════════════════════════════════

actions.get('/open', async (c) => {
  const db = c.get('db') as TenantDB;

  const actionList = await db.listActions({ status: 'open' });

  return c.json({ data: actionList });
});

// ═══════════════════════════════════════════════════════════
// GET /api/actions/overdue - List overdue action items
// ═══════════════════════════════════════════════════════════

actions.get('/overdue', async (c) => {
  const db = c.get('db') as TenantDB;

  const overdueList = await db.getOverdueActions();

  return c.json({ data: overdueList });
});

// ═══════════════════════════════════════════════════════════
// POST /api/actions - Create new action item
// ═══════════════════════════════════════════════════════════

actions.post('/', async (c) => {
  const db = c.get('db') as TenantDB;
  const body = await c.req.json();

  // Validate input
  const parsed = CreateActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }, 400);
  }

  const action = await db.createAction(parsed.data);

  return c.json({ data: action }, 201);
});

// ═══════════════════════════════════════════════════════════
// GET /api/actions/:id - Get action item details
// ═══════════════════════════════════════════════════════════

actions.get('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const actionId = c.req.param('id');

  if (!isValidId(actionId)) {
    return c.json({ error: 'Invalid action ID format' }, 400);
  }

  const action = await db.getAction(actionId);
  if (!action) {
    return c.json({ error: 'Action item not found' }, 404);
  }

  return c.json({ data: action });
});

// ═══════════════════════════════════════════════════════════
// PUT /api/actions/:id - Update action item
// ═══════════════════════════════════════════════════════════

actions.put('/:id', async (c) => {
  const user = c.get('user') as User;
  const actionId = c.req.param('id');

  if (!isValidId(actionId)) {
    return c.json({ error: 'Invalid action ID format' }, 400);
  }

  const body = await c.req.json();

  // Validate input
  const parsed = UpdateActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }, 400);
  }

  // Build update query
  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (parsed.data.description !== undefined) {
    updates.push('description = ?');
    params.push(parsed.data.description);
  }
  if (parsed.data.owner !== undefined) {
    updates.push('owner = ?');
    params.push(parsed.data.owner);
  }
  if (parsed.data.dueDate !== undefined) {
    updates.push('due_date = ?');
    params.push(parsed.data.dueDate);
  }
  if (parsed.data.status !== undefined) {
    updates.push('status = ?');
    params.push(parsed.data.status);

    if (parsed.data.status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
  }

  if (updates.length === 0) {
    const db = c.get('db') as TenantDB;
    const existing = await db.getAction(actionId);
    return c.json({ data: existing });
  }

  params.push(actionId, user.id);

  const result = await c.env.DB.prepare(`
    UPDATE action_items SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
  `).bind(...params).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Action item not found' }, 404);
  }

  const db = c.get('db') as TenantDB;
  const updated = await db.getAction(actionId);

  return c.json({ data: updated });
});

// ═══════════════════════════════════════════════════════════
// POST /api/actions/:id/complete - Mark action as completed
// ═══════════════════════════════════════════════════════════

actions.post('/:id/complete', async (c) => {
  const db = c.get('db') as TenantDB;
  const actionId = c.req.param('id');

  if (!isValidId(actionId)) {
    return c.json({ error: 'Invalid action ID format' }, 400);
  }

  const action = await db.completeAction(actionId);
  if (!action) {
    return c.json({ error: 'Action item not found' }, 404);
  }

  return c.json({ data: action });
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/actions/:id - Delete action item
// ═══════════════════════════════════════════════════════════

actions.delete('/:id', async (c) => {
  const user = c.get('user') as User;
  const actionId = c.req.param('id');

  if (!isValidId(actionId)) {
    return c.json({ error: 'Invalid action ID format' }, 400);
  }

  const result = await c.env.DB.prepare(`
    DELETE FROM action_items WHERE id = ? AND user_id = ?
  `).bind(actionId, user.id).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Action item not found' }, 404);
  }

  return c.json({ message: 'Action item deleted' });
});

export default actions;
