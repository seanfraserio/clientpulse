/**
 * Validation utilities for security
 */

/**
 * Validate ID format (32-character hex string from UUID without dashes)
 */
export function isValidId(id: string): boolean {
  return /^[a-f0-9]{32}$/.test(id);
}

/**
 * Validate URL is safe (https only, no javascript: etc)
 */
export function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize string for safe logging (remove potential secrets)
 */
export function sanitizeForLog(text: string, maxLength: number = 100): string {
  // Truncate and mask potential tokens/secrets
  const truncated = text.substring(0, maxLength);
  // Mask anything that looks like a token (long alphanumeric strings)
  return truncated.replace(/[a-zA-Z0-9_-]{20,}/g, '[REDACTED]');
}

/**
 * Allowed client statuses
 */
export const ALLOWED_STATUSES = ['active', 'paused', 'archived'] as const;
export type ClientStatus = typeof ALLOWED_STATUSES[number];

/**
 * Validate status parameter
 */
export function isValidStatus(status: string): status is ClientStatus {
  return ALLOWED_STATUSES.includes(status as ClientStatus);
}

/**
 * Parse and validate pagination limit
 */
export function parseLimit(value: string | undefined, defaultValue: number = 50, max: number = 100): number {
  const parsed = parseInt(value || String(defaultValue), 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, max);
}

/**
 * Validate Stripe price ID format (price_xxx or test mode prices)
 */
export function isValidStripePriceId(priceId: string): boolean {
  // Stripe price IDs start with "price_" followed by alphanumeric chars
  return /^price_[a-zA-Z0-9]{10,}$/.test(priceId);
}

/**
 * Validate email format (stricter than just regex)
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 255) return false;
  // Basic email validation - RFC 5322 simplified
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
}

/**
 * Validate cursor string (prevent injection)
 */
export function isValidCursor(cursor: string | undefined): boolean {
  if (!cursor) return true; // Optional
  // Cursors should be alphanumeric with allowed chars (base64 or IDs)
  return /^[a-zA-Z0-9_=-]{1,100}$/.test(cursor);
}
