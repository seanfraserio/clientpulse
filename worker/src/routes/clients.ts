import { Hono } from 'hono';
import { z } from 'zod';
import { TenantDB } from '../db/tenant-db';
import type { AppEnv } from '../index';
import type { User } from '@shared/types';

const clients = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// Validation Schemas
// ═══════════════════════════════════════════════════════════

const CreateClientSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  company: z.string().max(200).trim().optional(),
  email: z.string().email().max(255).toLowerCase().optional(),
  phone: z.string().max(50).optional(),
  role: z.string().max(100).optional(),
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
  const status = c.req.query('status') || 'active';
  const limit = parseInt(c.req.query('limit') || '50');
  const cursor = c.req.query('cursor');

  const clientList = await db.listClients({
    status,
    limit: Math.min(limit, 100),
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
  const db = c.get('db') as TenantDB;
  const user = c.get('user') as User;
  const body = await c.req.json();

  // Validate input
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
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

  if (currentCount >= tier.limits.maxClients) {
    return c.json({
      error: 'Client limit reached',
      limit: tier.limits.maxClients,
      upgrade_url: '/settings/billing'
    }, 403);
  }

  const client = await db.createClient(parsed.data);

  return c.json({ data: client }, 201);
});

// ═══════════════════════════════════════════════════════════
// GET /api/clients/:id - Get client details
// ═══════════════════════════════════════════════════════════

clients.get('/:id', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

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
  const limit = parseInt(c.req.query('limit') || '20');

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
// GET /api/clients/:id/health - Health score breakdown
// ═══════════════════════════════════════════════════════════

clients.get('/:id/health', async (c) => {
  const db = c.get('db') as TenantDB;
  const clientId = c.req.param('id');

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
