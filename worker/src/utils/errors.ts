/**
 * Standardized error responses for API consistency
 */

import type { Context } from 'hono';
import type { AppEnv } from '../index';

/**
 * Standard error response structure
 */
export interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Standard error codes for common scenarios
 */
export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  LIMIT_REACHED: 'LIMIT_REACHED',
  CSRF_INVALID: 'CSRF_INVALID',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * User-facing error messages (safe to expose)
 */
const ErrorMessages: Record<string, string> = {
  [ErrorCodes.VALIDATION_FAILED]: 'Validation failed',
  [ErrorCodes.INVALID_ID_FORMAT]: 'Invalid ID format',
  [ErrorCodes.INVALID_INPUT]: 'Invalid input',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Missing required field',
  [ErrorCodes.UNAUTHORIZED]: 'Unauthorized',
  [ErrorCodes.INVALID_TOKEN]: 'Invalid or expired token',
  [ErrorCodes.TOKEN_EXPIRED]: 'Token expired',
  [ErrorCodes.FORBIDDEN]: 'Forbidden',
  [ErrorCodes.LIMIT_REACHED]: 'Limit reached',
  [ErrorCodes.CSRF_INVALID]: 'CSRF token invalid',
  [ErrorCodes.NOT_FOUND]: 'Not found',
  [ErrorCodes.RESOURCE_NOT_FOUND]: 'Resource not found',
  [ErrorCodes.RATE_LIMITED]: 'Rate limit exceeded',
  [ErrorCodes.INTERNAL_ERROR]: 'Internal server error',
};

/**
 * Create a validation error response (400)
 */
export function validationError(
  c: Context<AppEnv>,
  details?: { path: string; message: string }[]
) {
  return c.json<ErrorResponse>({
    error: ErrorMessages[ErrorCodes.VALIDATION_FAILED],
    code: ErrorCodes.VALIDATION_FAILED,
    details
  }, 400);
}

/**
 * Create an invalid ID error response (400)
 */
export function invalidIdError(c: Context<AppEnv>, resourceType: string = 'resource') {
  return c.json<ErrorResponse>({
    error: `Invalid ${resourceType} ID format`,
    code: ErrorCodes.INVALID_ID_FORMAT
  }, 400);
}

/**
 * Create an unauthorized error response (401)
 */
export function unauthorizedError(c: Context<AppEnv>) {
  return c.json<ErrorResponse>({
    error: ErrorMessages[ErrorCodes.UNAUTHORIZED],
    code: ErrorCodes.UNAUTHORIZED
  }, 401);
}

/**
 * Create a forbidden error response (403)
 */
export function forbiddenError(c: Context<AppEnv>, reason?: string) {
  return c.json<ErrorResponse>({
    error: reason || ErrorMessages[ErrorCodes.FORBIDDEN],
    code: ErrorCodes.FORBIDDEN
  }, 403);
}

/**
 * Create a limit reached error response (403)
 */
export function limitReachedError(
  c: Context<AppEnv>,
  limitType: string,
  limit: number,
  upgradeUrl?: string
) {
  return c.json({
    error: `${limitType} limit reached`,
    code: ErrorCodes.LIMIT_REACHED,
    limit,
    upgrade_url: upgradeUrl
  }, 403);
}

/**
 * Create a not found error response (404)
 */
export function notFoundError(c: Context<AppEnv>, resourceType: string = 'Resource') {
  return c.json<ErrorResponse>({
    error: `${resourceType} not found`,
    code: ErrorCodes.NOT_FOUND
  }, 404);
}

/**
 * Create an internal server error response (500)
 * Note: Never expose internal error details in production
 */
export function internalError(c: Context<AppEnv>, error?: Error) {
  // Log the actual error internally
  if (error) {
    console.error('[API Error]', error);
  }

  // Return generic message to client
  return c.json<ErrorResponse>({
    error: ErrorMessages[ErrorCodes.INTERNAL_ERROR],
    code: ErrorCodes.INTERNAL_ERROR
  }, 500);
}
