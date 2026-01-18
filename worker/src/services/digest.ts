import type { Env } from '../index';
import type { Client, Note, ActionItem } from '@shared/types';
import { isValidHttpsUrl } from '../utils/validation';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface UserForDigest {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  daily_digest_time: string;
}

interface ClientDigestData {
  client: Client;
  recentNotes: Note[];
  openActions: ActionItem[];
}

interface DigestContent {
  userId: string;
  userEmail: string;
  userName: string | null;
  clients: ClientDigestData[];
  totalNotes: number;
  totalActions: number;
}

// ═══════════════════════════════════════════════════════════
// Get Users Due for Digest
// ═══════════════════════════════════════════════════════════

export async function getUsersDueForDigest(
  db: D1Database,
  currentHourUTC: number
): Promise<UserForDigest[]> {
  // Get users with digest enabled whose digest_time matches current hour
  // Note: This is simplified - in production you'd want to account for timezones properly
  const hourStr = currentHourUTC.toString().padStart(2, '0') + ':00';

  const result = await db.prepare(`
    SELECT id, email, name, timezone, daily_digest_time
    FROM users
    WHERE daily_digest_enabled = TRUE
      AND daily_digest_time = ?
      AND status = 'active'
  `).bind(hourStr).all();

  return result.results as unknown as UserForDigest[];
}

// ═══════════════════════════════════════════════════════════
// Generate Digest Content for a User
// ═══════════════════════════════════════════════════════════

export async function generateDigestContent(
  db: D1Database,
  user: UserForDigest
): Promise<DigestContent | null> {
  // Get clients with digest_enabled = true and recent activity
  const clientsResult = await db.prepare(`
    SELECT * FROM clients
    WHERE user_id = ?
      AND status = 'active'
      AND digest_enabled = 1
    ORDER BY health_status ASC, health_score ASC
  `).bind(user.id).all();

  if (clientsResult.results.length === 0) {
    return null;
  }

  const clients = clientsResult.results as unknown as Client[];
  const clientDigestData: ClientDigestData[] = [];
  let totalNotes = 0;
  let totalActions = 0;

  for (const client of clients) {
    // Get notes from last 24 hours
    const notesResult = await db.prepare(`
      SELECT * FROM notes
      WHERE client_id = ?
        AND created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(client.id).all();

    const recentNotes = notesResult.results as unknown as Note[];

    // Get open action items
    const actionsResult = await db.prepare(`
      SELECT * FROM action_items
      WHERE client_id = ?
        AND status = 'open'
        AND owner = 'me'
      ORDER BY due_date ASC NULLS LAST
      LIMIT 5
    `).bind(client.id).all();

    const openActions = actionsResult.results as unknown as ActionItem[];

    // Only include clients with recent activity or open actions
    if (recentNotes.length > 0 || openActions.length > 0) {
      clientDigestData.push({
        client: parseClient(client),
        recentNotes: recentNotes.map(parseNote),
        openActions
      });
      totalNotes += recentNotes.length;
      totalActions += openActions.length;
    }
  }

  if (clientDigestData.length === 0) {
    return null;
  }

  return {
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    clients: clientDigestData,
    totalNotes,
    totalActions
  };
}

// ═══════════════════════════════════════════════════════════
// Generate HTML Email
// ═══════════════════════════════════════════════════════════

export function generateDigestHtml(content: DigestContent, appUrl: string): string {
  const greeting = content.userName ? `Hi ${content.userName}` : 'Hi';
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const clientSections = content.clients.map(data => {
    const healthBadge = getHealthBadge(data.client.health_status);

    const notesList = data.recentNotes.length > 0
      ? data.recentNotes.map(note => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
              <div style="font-weight: 500; color: #374151;">
                ${escapeHtml(note.title || 'Untitled Note')}
              </div>
              ${note.ai_summary ? `
                <div style="margin-top: 4px; color: #6b7280; font-size: 13px;">
                  ${escapeHtml(note.ai_summary.substring(0, 150))}${note.ai_summary.length > 150 ? '...' : ''}
                </div>
              ` : ''}
              <div style="margin-top: 4px; color: #9ca3af; font-size: 12px;">
                ${new Date(note.created_at).toLocaleString()}
              </div>
            </td>
          </tr>
        `).join('')
      : '';

    const actionsList = data.openActions.length > 0
      ? data.openActions.map(action => {
          const isOverdue = action.due_date && new Date(action.due_date) < new Date();
          return `
            <tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">
                <div style="color: ${isOverdue ? '#dc2626' : '#374151'};">
                  ${isOverdue ? '⚠️ ' : ''}${escapeHtml(action.description)}
                </div>
                ${action.due_date ? `
                  <div style="margin-top: 4px; color: ${isOverdue ? '#dc2626' : '#9ca3af'}; font-size: 12px;">
                    Due: ${new Date(action.due_date).toLocaleDateString()}
                  </div>
                ` : ''}
              </td>
            </tr>
          `;
        }).join('')
      : '';

    return `
      <div style="margin-bottom: 24px; background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
        <!-- Client Header -->
        <div style="padding: 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td>
                <a href="${appUrl}/clients/${data.client.id}" style="text-decoration: none;">
                  <span style="font-size: 18px; font-weight: 600; color: #111827;">
                    ${escapeHtml(data.client.name)}
                  </span>
                </a>
                ${data.client.company ? `
                  <span style="color: #6b7280; margin-left: 8px;">
                    ${escapeHtml(data.client.company)}
                  </span>
                ` : ''}
              </td>
              <td style="text-align: right;">
                ${healthBadge}
              </td>
            </tr>
          </table>
        </div>

        ${data.recentNotes.length > 0 ? `
          <!-- Recent Notes -->
          <div style="padding: 16px;">
            <div style="font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 14px;">
              📝 Recent Notes
            </div>
            <table cellpadding="0" cellspacing="0" width="100%" style="background: #f9fafb; border-radius: 6px;">
              ${notesList}
            </table>
          </div>
        ` : ''}

        ${data.openActions.length > 0 ? `
          <!-- Open Actions -->
          <div style="padding: 16px; ${data.recentNotes.length > 0 ? 'padding-top: 0;' : ''}">
            <div style="font-weight: 600; color: #374151; margin-bottom: 8px; font-size: 14px;">
              ✅ Open Action Items
            </div>
            <table cellpadding="0" cellspacing="0" width="100%" style="background: #f9fafb; border-radius: 6px;">
              ${actionsList}
            </table>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClientPulse Daily Digest</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td>
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; color: #4f46e5; margin: 0;">ClientPulse</h1>
          <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">Daily Digest</p>
        </div>

        <!-- Greeting -->
        <div style="background: #ffffff; border-radius: 8px; padding: 20px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px;">${greeting},</h2>
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Here's your client activity summary for ${date}.
          </p>
          <p style="margin: 12px 0 0 0; color: #374151; font-size: 14px;">
            <strong>${content.clients.length}</strong> clients with activity •
            <strong>${content.totalNotes}</strong> new notes •
            <strong>${content.totalActions}</strong> open actions
          </p>
        </div>

        <!-- Client Sections -->
        ${clientSections}

        <!-- Footer -->
        <div style="text-align: center; padding: 20px;">
          <a href="${appUrl}/dashboard" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
            Open Dashboard
          </a>
          <p style="margin: 16px 0 0 0; color: #9ca3af; font-size: 12px;">
            You're receiving this because you have daily digests enabled.
            <br>
            <a href="${appUrl}/settings" style="color: #6b7280;">Manage notification preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ═══════════════════════════════════════════════════════════
// Send Digest Email
// ═══════════════════════════════════════════════════════════

export async function sendDigestEmail(
  content: DigestContent,
  env: Env
): Promise<{ success: boolean; emailId?: string; error?: string }> {
  // Validate APP_URL before using in email links to prevent phishing
  if (!isValidHttpsUrl(env.APP_URL)) {
    console.error('[Digest] Invalid APP_URL configuration:', env.APP_URL);
    return { success: false, error: 'Invalid APP_URL configuration' };
  }

  const html = generateDigestHtml(content, env.APP_URL);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: content.userEmail,
        subject: `ClientPulse Daily Digest - ${content.clients.length} clients, ${content.totalNotes} notes`,
        html
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    const result = await response.json() as { id: string };
    return { success: true, emailId: result.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Log Digest Send
// ═══════════════════════════════════════════════════════════

export async function logDigestSend(
  db: D1Database,
  userId: string,
  content: DigestContent,
  emailId: string | undefined
): Promise<void> {
  const attentionCount = content.clients.filter(c => c.client.health_status === 'attention').length;
  const watchCount = content.clients.filter(c => c.client.health_status === 'watch').length;

  await db.prepare(`
    INSERT INTO digest_log (id, user_id, attention_count, watch_count, action_count, email_id)
    VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
  `).bind(
    userId,
    attentionCount,
    watchCount,
    content.totalActions,
    emailId || null
  ).run();
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function getHealthBadge(status: string): string {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    attention: { bg: '#fef2f2', text: '#dc2626', label: 'Needs Attention' },
    watch: { bg: '#fffbeb', text: '#d97706', label: 'Watch' },
    healthy: { bg: '#f0fdf4', text: '#16a34a', label: 'Healthy' }
  };

  const style = styles[status] || styles.healthy;

  return `
    <span style="display: inline-block; padding: 4px 10px; border-radius: 12px; background: ${style.bg}; color: ${style.text}; font-size: 12px; font-weight: 500;">
      ${style.label}
    </span>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseClient(row: unknown): Client {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    tags: JSON.parse(r.tags as string || '[]'),
    ai_personal_details: JSON.parse(r.ai_personal_details as string || '[]'),
    health_signals: JSON.parse(r.health_signals as string || '[]'),
    digest_enabled: r.digest_enabled === 1 || r.digest_enabled === true
  } as Client;
}

function parseNote(row: unknown): Note {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    attendees: JSON.parse(r.attendees as string || '[]'),
    ai_risk_signals: JSON.parse(r.ai_risk_signals as string || '[]'),
    ai_personal_details: JSON.parse(r.ai_personal_details as string || '[]'),
    ai_topics: JSON.parse(r.ai_topics as string || '[]'),
    ai_key_insights: JSON.parse(r.ai_key_insights as string || '[]'),
    ai_relationship_signals: JSON.parse(r.ai_relationship_signals as string || '[]'),
    ai_follow_up_recommendations: JSON.parse(r.ai_follow_up_recommendations as string || '[]'),
    ai_communication_style: r.ai_communication_style as string | null
  } as Note;
}
