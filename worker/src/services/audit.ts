/**
 * Audit logging service for security-sensitive operations
 */

import { generateId } from '../utils/crypto';

/**
 * Audit event types for tracking
 */
export const AuditActions = {
  // Authentication events
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  MAGIC_LINK_REQUESTED: 'auth.magic_link_requested',
  MAGIC_LINK_USED: 'auth.magic_link_used',
  SESSION_CREATED: 'auth.session_created',
  SESSION_EXPIRED: 'auth.session_expired',
  OAUTH_LOGIN: 'auth.oauth_login',

  // Billing events
  SUBSCRIPTION_CREATED: 'billing.subscription_created',
  SUBSCRIPTION_UPDATED: 'billing.subscription_updated',
  SUBSCRIPTION_CANCELLED: 'billing.subscription_cancelled',
  CHECKOUT_STARTED: 'billing.checkout_started',
  PAYMENT_FAILED: 'billing.payment_failed',

  // Data events
  CLIENT_CREATED: 'data.client_created',
  CLIENT_DELETED: 'data.client_deleted',
  NOTE_CREATED: 'data.note_created',
  NOTE_DELETED: 'data.note_deleted',

  // Security events
  RATE_LIMITED: 'security.rate_limited',
  CSRF_FAILED: 'security.csrf_failed',
  INVALID_TOKEN: 'security.invalid_token',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];

export interface AuditLogEntry {
  userId: string;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(
  db: D1Database,
  entry: AuditLogEntry
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO audit_log (
        id, user_id, action, resource_type, resource_id,
        ip_address, user_agent, success, error_message, details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      generateId(),
      entry.userId,
      entry.action,
      entry.resourceType,
      entry.resourceId || null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.success ? 1 : 0,
      entry.errorMessage || null,
      entry.details ? JSON.stringify(entry.details) : null
    ).run();
  } catch (error) {
    // Don't let audit logging failures break the main operation
    console.error('[Audit] Failed to log event:', error, entry);
  }
}

/**
 * Helper to extract IP address from request context
 */
export function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ||
         c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
         'unknown';
}

/**
 * Helper to get user agent from request
 */
export function getUserAgent(c: { req: { header: (name: string) => string | undefined } }): string {
  const ua = c.req.header('User-Agent') || 'unknown';
  // Truncate to prevent storage bloat
  return ua.substring(0, 255);
}

/**
 * Audit authentication success
 */
export async function auditAuthSuccess(
  db: D1Database,
  userId: string,
  method: 'magic_link' | 'oauth_google' | 'oauth_github',
  c: { req: { header: (name: string) => string | undefined } }
): Promise<void> {
  await logAuditEvent(db, {
    userId,
    action: method === 'magic_link' ? AuditActions.MAGIC_LINK_USED : AuditActions.OAUTH_LOGIN,
    resourceType: 'auth',
    resourceId: method,
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
    success: true,
    details: { method }
  });
}

/**
 * Audit authentication failure
 */
export async function auditAuthFailure(
  db: D1Database,
  identifier: string, // email or user ID if known
  reason: string,
  c: { req: { header: (name: string) => string | undefined } }
): Promise<void> {
  await logAuditEvent(db, {
    userId: identifier,
    action: AuditActions.LOGIN_FAILED,
    resourceType: 'auth',
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
    success: false,
    errorMessage: reason
  });
}

/**
 * Audit billing event
 */
export async function auditBillingEvent(
  db: D1Database,
  userId: string,
  action: AuditAction,
  details?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent(db, {
    userId,
    action,
    resourceType: 'billing',
    success: true,
    details
  });
}

/**
 * Audit data deletion
 */
export async function auditDeletion(
  db: D1Database,
  userId: string,
  resourceType: string,
  resourceId: string,
  c: { req: { header: (name: string) => string | undefined } }
): Promise<void> {
  await logAuditEvent(db, {
    userId,
    action: resourceType === 'client' ? AuditActions.CLIENT_DELETED : AuditActions.NOTE_DELETED,
    resourceType,
    resourceId,
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
    success: true
  });
}
