import { Hono } from 'hono';
import { TenantDB } from '../db/tenant-db';
import type { AppEnv } from '../index';
import type { User } from '@shared/types';
import { generateDigestContent, sendDigestEmail, logDigestSend } from '../services/digest';

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

// ═══════════════════════════════════════════════════════════
// POST /api/radar/test-digest - Send a test digest email
// ═══════════════════════════════════════════════════════════

radar.post('/test-digest', async (c) => {
  const user = c.get('user') as User;

  try {
    // Generate digest content for this user
    const content = await generateDigestContent(c.env.DB, {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      daily_digest_time: user.daily_digest_time
    });

    if (!content) {
      return c.json({
        error: 'No digest content',
        message: 'No clients with recent activity or open actions found'
      }, 400);
    }

    // Send the digest email
    const result = await sendDigestEmail(content, c.env);

    if (!result.success) {
      return c.json({
        error: 'Failed to send digest',
        message: result.error
      }, 500);
    }

    // Log the send
    await logDigestSend(c.env.DB, user.id, content, result.emailId);

    return c.json({
      success: true,
      message: `Digest sent to ${user.email}`,
      emailId: result.emailId,
      summary: {
        clients: content.clients.length,
        notes: content.totalNotes,
        actions: content.totalActions
      }
    });
  } catch (error) {
    console.error('[Test Digest] Error:', error);
    return c.json({
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default radar;
