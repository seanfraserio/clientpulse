import { Hono } from 'hono';
import { z } from 'zod';
import { TenantDB } from '../db/tenant-db';
import { isValidId, isValidStatus, parseLimit } from '../utils/validation';
import type { AppEnv } from '../index';
import type { User } from '@shared/types';

const clients = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const CreateClientSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  company: z.string().max(200).trim().nullish(),
  email: z.string().email().max(255).toLowerCase().nullish(),
  phone: z.string().max(50).nullish(),
  role: z.string().max(100).nullish(),
  notes: z.string().nullish(), // Initial notes field from form
  tags: z.array(z.string().max(50)).max(20).optional()
});

const UpdateClientSchema = CreateClientSchema.partial().extend({
  status: z.enum(['active', 'paused', 'archived']).optional(),
  next_followup_at: z.string().datetime().optional().nullable()
});

// ═══════════════════════════════════════════════════════════
// GET /api/clients - List all clients
// ═══════════════════════════════════════════════════════════

clients.get('/', async (c) => {
  const db = c.get('db') as TenantDB;
  const statusParam = c.req.query('status') || 'active';
  const limit = parseLimit(c.req.query('limit'));
  const cursor = c.req.query('cursor');

  // Validate status parameter
  if (!isValidStatus(statusParam)) {
    return c.json({ error: 'Invalid status parameter' }, 400);
  }

  const clientList = await db.listClients({
    status: statusParam,
    limit,
    cursor
  });

  return c.json({
    data: clientList,
    meta: {
      hasMore: clientList.length === limit,
      cursor: clientList.length > 0 ? clientList[clientList.length - 1].id : undefined
    }
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/clients - Create new client
// ═══════════════════════════════════════════════════════════

clients.post('/', async (c) => {
  try {
    const db = c.get('db') as TenantDB;
    const user = c.get('user') as User;
    const body = await c.req.json();

    console.log('[Clients] Creating client, body:', JSON.stringify(body));

    // Validate input
    const parsed = CreateClientSchema.safeParse(body);
    if (!parsed.success) {
      console.log('[Clients] Validation failed:', JSON.stringify(parsed.error.errors));
      return c.json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      }, 400);
    }

    // Check client limit
    const { getTierByPlan } = await import('@shared/billing');
    const tier = getTierByPlan(user.plan);
    const currentCount = await db.getClientCount();

    console.log('[Clients] User plan:', user.plan, 'Current count:', currentCount, 'Limit:', tier.limits.maxClients);

    if (currentCount >= tier.limits.maxClients) {
      return c.json({
        error: 'Client limit reached',
        limit: tier.limits.maxClients,
        upgrade_url: '/settings/billing'
      }, 403);
    }

    const client = await db.createClient(parsed.data);
    console.log('[Clients] Created client:', client.id);

    return c.json({ data: client }, 201);
  } catch (error) {
    console.error('[Clients] Error creating client:', error);
    return c.json({
      error: 'Failed to create client',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// ═══════════════════════════════════════════════════════════
// GET /api/clients/:id - Get client details
// ═══════════════════════════════════════════════════════════

clients.get('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const client = await db.getClient(clientId);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  // Get recent notes
  const recentNotes = await db.listNotes({ clientId, limit: 5 });

  // Get open actions
  const openActions = await db.listActions({ clientId, status: 'open' });

  return c.json({
    data: {
      ...client,
      recentNotes,
      openActions
    }
  });
});

// ═══════════════════════════════════════════════════════════
// PUT /api/clients/:id - Update client
// ═══════════════════════════════════════════════════════════

clients.put('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const body = await c.req.json();

  // Validate input
  const parsed = UpdateClientSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: 'Validation failed',
      details: parsed.error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    }, 400);
  }

  const client = await db.updateClient(clientId, parsed.data);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  return c.json({ data: client });
});

// ═══════════════════════════════════════════════════════════
// DELETE /api/clients/:id - Archive client (soft delete)
// ═══════════════════════════════════════════════════════════

clients.delete('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const success = await db.archiveClient(clientId);
  if (!success) {
    return c.json({ error: 'Client not found' }, 404);
  }

  return c.json({ message: 'Client archived' });
});

// ═══════════════════════════════════════════════════════════
// GET /api/clients/:id/timeline - Full interaction timeline
// ═══════════════════════════════════════════════════════════

clients.get('/:id/timeline', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');
  const limit = parseLimit(c.req.query('limit'), 20);

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const client = await db.getClient(clientId);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const notes = await db.listNotes({ clientId, limit });

  return c.json({
    data: {
      client,
      timeline: notes
    }
  });
});

// ═══════════════════════════════════════════════════════════
// PATCH /api/clients/:id/digest - Toggle digest inclusion
// ═══════════════════════════════════════════════════════════

clients.patch('/:id/digest', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const body = await c.req.json();

  // Validate input
  const enabled = body.enabled;
  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  // Get client to verify ownership
  const client = await db.getClient(clientId);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  // Update digest_enabled - need direct DB access for this specific field
  const user = c.get('user') as User;
  const rawDb = (c.env as { DB: D1Database }).DB;

  await rawDb.prepare(`
    UPDATE clients SET digest_enabled = ? WHERE id = ? AND user_id = ?
  `).bind(enabled ? 1 : 0, clientId, user.id).run();

  return c.json({
    data: {
      id: clientId,
      digest_enabled: enabled
    }
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/clients/:id/health - Health score breakdown
// ═══════════════════════════════════════════════════════════

clients.get('/:id/health', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

  if (!isValidId(clientId)) {
    return c.json({ error: 'Invalid client ID format' }, 400);
  }

  const client = await db.getClient(clientId);
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  return c.json({
    data: {
      score: client.health_score,
      status: client.health_status,
      trend: client.health_trend,
      signals: client.health_signals,
      updatedAt: client.health_updated_at
    }
  });
});

export default clients;
