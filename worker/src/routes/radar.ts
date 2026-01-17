import { Hono } from 'hono';
import { TenantDB } from '../db/tenant-db';
import type { AppEnv } from '../index';

const radar = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// GET /api/radar - Main radar dashboard data
// ═══════════════════════════════════════════════════════════

radar.get('/', async (c) => {
  const db = c.get('db') as TenantDB;

  const radarData = await db.getRadarData();

  return c.json({ data: radarData });
});

// ═══════════════════════════════════════════════════════════
// GET /api/radar/attention - Only "needs attention" clients
// ═══════════════════════════════════════════════════════════

radar.get('/attention', async (c) => {
  const db = c.get('db') as TenantDB;

  const radarData = await db.getRadarData();

  return c.json({
    data: radarData.attention,
    count: radarData.attention.length
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/radar/commitments - All open action items (mine)
// ═══════════════════════════════════════════════════════════

radar.get('/commitments', async (c) => {
  const db = c.get('db') as TenantDB;

  const openActions = await db.listActions({
    status: 'open',
    owner: 'me'
  });

  // Group by client
  const byClient: Record<string, typeof openActions> = {};
  for (const action of openActions) {
    if (!byClient[action.client_id]) {
      byClient[action.client_id] = [];
    }
    byClient[action.client_id].push(action);
  }

  return c.json({
    data: {
      total: openActions.length,
      overdue: openActions.filter(a => a.due_date && new Date(a.due_date) < new Date()).length,
      byClient
    }
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/radar/stats - Dashboard statistics
// ═══════════════════════════════════════════════════════════

radar.get('/stats', async (c) => {
  const db = c.get('db') as TenantDB;

  const radarData = await db.getRadarData();

  // Calculate additional stats
  const totalClients = radarData.stats.totalClients;
  const healthyPercent = totalClients > 0
    ? Math.round((radarData.healthy.length / totalClients) * 100)
    : 100;

  // Get notes from last 7 days
  const recentNotes = await db.listNotes({ limit: 100 });
  const last7Days = recentNotes.filter(n => {
    const noteDate = new Date(n.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return noteDate >= weekAgo;
  });

  return c.json({
    data: {
      clients: {
        total: totalClients,
        attention: radarData.stats.needsAttention,
        watch: radarData.watch.length,
        healthy: radarData.healthy.length,
        healthyPercent
      },
      commitments: {
        total: radarData.overdueActions.length + radarData.attention.reduce(
          (sum, c) => sum + c.open_commitments, 0
        ),
        overdue: radarData.overdueActions.length
      },
      activity: {
        notesThisWeek: last7Days.length,
        meetingsThisWeek: last7Days.filter(n => n.note_type === 'meeting').length
      }
    }
  });
});

export default radar;
