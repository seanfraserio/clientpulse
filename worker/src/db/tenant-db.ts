import { generateId } from '../utils/crypto';
import type {
  Client,
  Note,
  ActionItem,
  CreateClientInput,
  UpdateClientInput,
  CreateNoteInput,
  CreateActionInput,
  RadarData,
  ClientWithStats,
  OverdueAction
} from '@shared/types';

/**
 * Tenant-isolated database wrapper.
 * All queries automatically include user_id filtering to ensure data isolation.
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
    `).bind(clientId, this.userId).first();

    if (!result) return null;
    return this.parseClient(result);
  }

  async listClients(options: {
    status?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<Client[]> {
    const { status = 'active', limit = 50, cursor } = options;

    let query = `SELECT * FROM clients WHERE user_id = ? AND status = ?`;
    const params: (string | number)[] = [this.userId, status];

    if (cursor) {
      query += ` AND id > ?`;
      params.push(cursor);
    }

    query += ` ORDER BY name ASC LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results.map(r => this.parseClient(r));
  }

  async getClientCount(): Promise<number> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as count FROM clients
      WHERE user_id = ? AND status = 'active'
    `).bind(this.userId).first<{ count: number }>();

    return result?.count || 0;
  }

  async createClient(data: CreateClientInput): Promise<Client> {
    const id = generateId();

    await this.db.prepare(`
      INSERT INTO clients (id, user_id, name, company, email, phone, role, tags, client_since)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now'))
    `).bind(
      id,
      this.userId,
      data.name,
      data.company || null,
      data.email || null,
      data.phone || null,
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
    const existing = await this.getClient(clientId);
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name);
    }
    if (data.company !== undefined) {
      updates.push('company = ?');
      params.push(data.company || null);
    }
    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email || null);
    }
    if (data.phone !== undefined) {
      updates.push('phone = ?');
      params.push(data.phone || null);
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      params.push(data.role || null);
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(data.tags));
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
      if (data.status === 'archived') {
        updates.push('archived_at = CURRENT_TIMESTAMP');
      }
    }
    if (data.next_followup_at !== undefined) {
      updates.push('next_followup_at = ?');
      params.push(data.next_followup_at || null);
    }

    if (updates.length === 0) return existing;

    params.push(clientId, this.userId);

    await this.db.prepare(`
      UPDATE clients SET ${updates.join(', ')} WHERE id = ? AND user_id = ?
    `).bind(...params).run();

    return this.getClient(clientId);
  }

  async archiveClient(clientId: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE clients
      SET status = 'archived', archived_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(clientId, this.userId).run();

    if (result.meta.changes > 0) {
      await this.db.prepare(`
        UPDATE users SET clients_count = clients_count - 1 WHERE id = ?
      `).bind(this.userId).run();
    }

    return result.meta.changes > 0;
  }

  // ═══════════════════════════════════════════════════════════
  // NOTES
  // ═══════════════════════════════════════════════════════════

  async getNote(noteId: string): Promise<Note | null> {
    const result = await this.db.prepare(`
      SELECT * FROM notes WHERE id = ? AND user_id = ?
    `).bind(noteId, this.userId).first();

    if (!result) return null;
    return this.parseNote(result);
  }

  async listNotes(options: {
    clientId?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<Note[]> {
    const { clientId, limit = 50, cursor } = options;

    let query = `
      SELECT n.*, c.name as client_name
      FROM notes n
      JOIN clients c ON c.id = n.client_id
      WHERE n.user_id = ?
    `;
    const params: (string | number)[] = [this.userId];

    if (clientId) {
      query += ` AND n.client_id = ?`;
      params.push(clientId);
    }

    if (cursor) {
      query += ` AND n.created_at < ?`;
      params.push(cursor);
    }

    query += ` ORDER BY n.created_at DESC LIMIT ?`;
    params.push(limit);

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results.map(r => this.parseNote(r));
  }

  async createNote(data: CreateNoteInput): Promise<Note> {
    // Verify client belongs to user
    const client = await this.getClient(data.clientId);
    if (!client) {
      throw new TenantError('Client not found or access denied');
    }

    const id = generateId();

    await this.db.prepare(`
      INSERT INTO notes (
        id, user_id, client_id, note_type, title, meeting_date,
        meeting_type, duration_minutes, attendees,
        summary, discussed, decisions, action_items_raw,
        concerns, personal_notes, next_steps, mood, ai_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      id,
      this.userId,
      data.clientId,
      data.noteType || 'meeting',
      data.title || null,
      data.meetingDate || null,
      data.meetingType || null,
      data.durationMinutes || null,
      JSON.stringify(data.attendees || []),
      data.summary || null,
      data.discussed || null,
      data.decisions || null,
      data.actionItemsRaw || null,
      data.concerns || null,
      data.personalNotes || null,
      data.nextSteps || null,
      data.mood || 'neutral'
    ).run();

    // Update client's last contact and meeting count
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

  async getAction(actionId: string): Promise<ActionItem | null> {
    const result = await this.db.prepare(`
      SELECT * FROM action_items WHERE id = ? AND user_id = ?
    `).bind(actionId, this.userId).first();

    if (!result) return null;
    return result as unknown as ActionItem;
  }

  async listActions(options: {
    status?: string;
    owner?: string;
    clientId?: string;
    limit?: number;
  } = {}): Promise<ActionItem[]> {
    const { status, owner, clientId, limit = 100 } = options;

    let query = `SELECT * FROM action_items WHERE user_id = ?`;
    const params: (string | number)[] = [this.userId];

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

    const result = await this.db.prepare(query).bind(...params).all();
    return result.results as unknown as ActionItem[];
  }

  async getOverdueActions(): Promise<OverdueAction[]> {
    const result = await this.db.prepare(`
      SELECT
        ai.id,
        ai.description,
        ai.client_id,
        c.name as client_name,
        ai.due_date,
        CAST(julianday('now') - julianday(ai.due_date) AS INTEGER) as days_overdue
      FROM action_items ai
      JOIN clients c ON c.id = ai.client_id
      WHERE ai.user_id = ?
        AND ai.status = 'open'
        AND ai.owner = 'me'
        AND ai.due_date < date('now')
      ORDER BY ai.due_date ASC
    `).bind(this.userId).all();

    return result.results as unknown as OverdueAction[];
  }

  async createAction(data: CreateActionInput): Promise<ActionItem> {
    // Verify client belongs to user
    const client = await this.getClient(data.clientId);
    if (!client) {
      throw new TenantError('Client not found or access denied');
    }

    const id = generateId();

    await this.db.prepare(`
      INSERT INTO action_items (id, user_id, client_id, note_id, description, owner, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      this.userId,
      data.clientId,
      data.noteId || null,
      data.description,
      data.owner || 'me',
      data.dueDate || null
    ).run();

    return this.getAction(id) as Promise<ActionItem>;
  }

  async completeAction(actionId: string): Promise<ActionItem | null> {
    const result = await this.db.prepare(`
      UPDATE action_items
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(actionId, this.userId).run();

    if (result.meta.changes === 0) return null;
    return this.getAction(actionId);
  }

  // ═══════════════════════════════════════════════════════════
  // RADAR (Dashboard Aggregations)
  // ═══════════════════════════════════════════════════════════

  async getRadarData(): Promise<RadarData> {
    // Get all active clients with stats
    const clientsResult = await this.db.prepare(`
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
    `).bind(this.userId).all();

    const clients = clientsResult.results.map(r => ({
      ...this.parseClient(r),
      open_commitments: r.open_commitments as number,
      overdue_count: r.overdue_count as number
    })) as ClientWithStats[];

    const attention = clients.filter(c => c.health_status === 'attention');
    const watch = clients.filter(c => c.health_status === 'watch');
    const healthy = clients.filter(c => c.health_status === 'healthy');

    const overdueActions = await this.getOverdueActions();

    return {
      attention,
      watch,
      healthy,
      overdueActions,
      stats: {
        totalClients: clients.length,
        needsAttention: attention.length,
        overdueActions: overdueActions.length
      }
    };
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private parseClient(row: Record<string, unknown>): Client {
    return {
      ...row,
      tags: JSON.parse(row.tags as string || '[]'),
      ai_personal_details: JSON.parse(row.ai_personal_details as string || '[]'),
      health_signals: JSON.parse(row.health_signals as string || '[]'),
      digest_enabled: row.digest_enabled === 1 || row.digest_enabled === true
    } as Client;
  }

  private parseNote(row: Record<string, unknown>): Note {
    return {
      ...row,
      attendees: JSON.parse(row.attendees as string || '[]'),
      ai_risk_signals: JSON.parse(row.ai_risk_signals as string || '[]'),
      ai_personal_details: JSON.parse(row.ai_personal_details as string || '[]'),
      ai_topics: JSON.parse(row.ai_topics as string || '[]'),
      ai_key_insights: JSON.parse(row.ai_key_insights as string || '[]'),
      ai_relationship_signals: JSON.parse(row.ai_relationship_signals as string || '[]'),
      ai_follow_up_recommendations: JSON.parse(row.ai_follow_up_recommendations as string || '[]'),
      ai_communication_style: row.ai_communication_style as string | null
    } as Note;
  }
}

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
  }
}
