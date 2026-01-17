import { Context, Next } from 'hono';
import type { AppEnv } from '../index';

/**
 * Content-Type validation middleware
 * Ensures requests with bodies have proper Content-Type header
 * Protects against content-type confusion attacks
 */
export async function contentTypeMiddleware(c: Context<AppEnv>, next: Next) {
  const method = c.req.method.toUpperCase();

  // Only check methods that typically have request bodies
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = c.req.header('Content-Type');

    // Allow requests without Content-Type if they have no body
    // Check Content-Length header to determine if there's a body
    const contentLength = c.req.header('Content-Length');
    const hasBody = contentLength && parseInt(contentLength, 10) > 0;

    if (hasBody) {
      // Require Content-Type for requests with bodies
      if (!contentType) {
        return c.json({
          error: 'Missing Content-Type header',
          message: 'Requests with a body must include a Content-Type header'
        }, 400);
      }

      // Only allow JSON content type for API routes
      const isJson = contentType.toLowerCase().includes('application/json');

      if (!isJson) {
        return c.json({
          error: 'Unsupported Content-Type',
          message: 'API only accepts application/json content type',
          received: contentType
        }, 415);
      }
    }
  }

  await next();
}
