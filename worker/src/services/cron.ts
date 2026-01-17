import type { Env } from '../index';
import {
  getUsersDueForDigest,
  generateDigestContent,
  sendDigestEmail,
  logDigestSend
} from './digest';

// ═══════════════════════════════════════════════════════════
// Send Due Digests
// Runs hourly to send daily digests to users at their preferred time
// ═══════════════════════════════════════════════════════════

export async function sendDueDigests(env: Env): Promise<void> {
  const currentHourUTC = new Date().getUTCHours();

  console.log(`[Cron] Checking for digests due at ${currentHourUTC}:00 UTC`);

  try {
    // Get users whose digest is due now
    const users = await getUsersDueForDigest(env.DB, currentHourUTC);

    if (users.length === 0) {
      console.log('[Cron] No users due for digest at this hour');
      return;
    }

    console.log(`[Cron] Found ${users.length} users due for digest`);

    // Process each user
    for (const user of users) {
      try {
        console.log(`[Cron] Generating digest for user ${user.id} (${user.email})`);

        // Generate digest content
        const content = await generateDigestContent(env.DB, user);

        if (!content) {
          console.log(`[Cron] No content for user ${user.id}, skipping`);
          continue;
        }

        console.log(`[Cron] Sending digest: ${content.clients.length} clients, ${content.totalNotes} notes, ${content.totalActions} actions`);

        // Send email
        const result = await sendDigestEmail(content, env);

        if (result.success) {
          console.log(`[Cron] Digest sent successfully to ${user.email}, email ID: ${result.emailId}`);

          // Log the send
          await logDigestSend(env.DB, user.id, content, result.emailId);
        } else {
          console.error(`[Cron] Failed to send digest to ${user.email}: ${result.error}`);
        }
      } catch (userError) {
        console.error(`[Cron] Error processing digest for user ${user.id}:`, userError);
        // Continue with other users
      }
    }

    console.log('[Cron] Digest processing complete');
  } catch (error) {
    console.error('[Cron] Error in sendDueDigests:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// Recalculate All Health
// Runs nightly to recalculate health scores for all clients
// ═══════════════════════════════════════════════════════════

export async function recalculateAllHealth(env: Env): Promise<void> {
  console.log('[Cron] Starting nightly health recalculation');

  try {
    // Get all active clients
    const clientsResult = await env.DB.prepare(`
      SELECT c.id, c.user_id, c.last_contact_at
      FROM clients c
      JOIN users u ON u.id = c.user_id
      WHERE c.status = 'active'
        AND u.status = 'active'
    `).all();

    console.log(`[Cron] Processing ${clientsResult.results.length} active clients`);

    let processed = 0;
    let updated = 0;

    for (const client of clientsResult.results) {
      const clientId = client.id as string;

      // Calculate days since last contact
      const lastContact = client.last_contact_at ? new Date(client.last_contact_at as string) : null;
      const daysSinceContact = lastContact
        ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Get overdue actions count
      const overdueResult = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM action_items
        WHERE client_id = ? AND status = 'open' AND owner = 'me' AND due_date < date('now')
      `).bind(clientId).first();

      const overdueCount = overdueResult?.count as number || 0;

      // Calculate health score
      let score = 100;
      const signals: unknown[] = [];

      if (daysSinceContact > 21) {
        score -= 25;
        signals.push({
          type: 'contact_gap',
          severity: 'high',
          title: 'Needs check-in',
          description: `No contact in ${daysSinceContact} days`
        });
      } else if (daysSinceContact > 14) {
        score -= 10;
        signals.push({
          type: 'contact_gap',
          severity: 'medium',
          title: 'Getting quiet',
          description: `No contact in ${daysSinceContact} days`
        });
      }

      if (overdueCount > 0) {
        score -= overdueCount * 10;
        signals.push({
          type: 'overdue_commitment',
          severity: 'high',
          title: `${overdueCount} overdue`,
          description: `You have ${overdueCount} overdue commitments`
        });
      }

      score = Math.max(0, Math.min(100, score));
      const status = score >= 70 ? 'healthy' : score >= 40 ? 'watch' : 'attention';

      // Update client health
      const updateResult = await env.DB.prepare(`
        UPDATE clients SET
          health_score = ?,
          health_status = ?,
          health_signals = ?,
          health_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(score, status, JSON.stringify(signals), clientId).run();

      if (updateResult.meta.changes > 0) {
        updated++;
      }

      processed++;

      // Log progress every 100 clients
      if (processed % 100 === 0) {
        console.log(`[Cron] Processed ${processed}/${clientsResult.results.length} clients`);
      }
    }

    console.log(`[Cron] Health recalculation complete: ${updated} clients updated`);

    // Create health snapshots for trend analysis
    const snapshotDate = new Date().toISOString().split('T')[0];

    await env.DB.prepare(`
      INSERT INTO health_snapshots (id, client_id, score, status, signals, snapshot_date)
      SELECT
        lower(hex(randomblob(16))),
        id,
        health_score,
        health_status,
        health_signals,
        ?
      FROM clients
      WHERE status = 'active'
    `).bind(snapshotDate).run();

    console.log('[Cron] Health snapshots created');
  } catch (error) {
    console.error('[Cron] Error in recalculateAllHealth:', error);
    throw error;
  }
}
