import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { User } from '@shared/types';
import { TenantDB } from './db/tenant-db';

import auth from './routes/auth';
import oauth from './routes/oauth';
import clients from './routes/clients';
import notes from './routes/notes';
import actions from './routes/actions';
import radar from './routes/radar';
import billing from './routes/billing';
import webhooks from './routes/webhooks';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { handleAIQueue } from './services/queue';

// ═══════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AI: Ai;
  AI_QUEUE: Queue;
  ENVIRONMENT: string;
  APP_URL: string;
  API_URL: string;
  FROM_EMAIL: string;
  GEMINI_MODEL: string;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
  GEMINI_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // OAuth providers
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_CP_ID: string;
  GITHUB_CLIENT_CP_SECRET: string;
}

// ═══════════════════════════════════════════════════════════
// Context Variables Type
// ═══════════════════════════════════════════════════════════

export type Variables = {
  user: User;
  db: TenantDB;
};

export type AppEnv = {
  Bindings: Env;
  Variables: Variables;
};

// ═══════════════════════════════════════════════════════════
// App Setup
// ═══════════════════════════════════════════════════════════

const app = new Hono<AppEnv>();

// Global middleware
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [c.env.APP_URL, 'http://localhost:4321', 'http://localhost:3000'];
    return allowed.includes(origin) ? origin : allowed[0];
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Rate limiting (applied after CORS for preflight requests)
app.use('/api/*', rateLimitMiddleware);

// ═══════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════
// Public Routes
// ═══════════════════════════════════════════════════════════

app.route('/api/auth', auth);
app.route('/api/auth/oauth', oauth);
app.route('/api/webhooks', webhooks);

// ═══════════════════════════════════════════════════════════
// Protected Routes (require authentication)
// ═══════════════════════════════════════════════════════════

const protectedApi = new Hono<AppEnv>();
protectedApi.use('*', authMiddleware);

protectedApi.route('/clients', clients);
protectedApi.route('/notes', notes);
protectedApi.route('/actions', actions);
protectedApi.route('/radar', radar);
protectedApi.route('/billing', billing);

app.route('/api', protectedApi);

// ═══════════════════════════════════════════════════════════
// 404 Handler
// ═══════════════════════════════════════════════════════════

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ═══════════════════════════════════════════════════════════
// Error Handler
// ═══════════════════════════════════════════════════════════

app.onError((err, c) => {
  console.error('Unhandled error:', err);

  if (err.message === 'Unauthorized') {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (err.message === 'Forbidden') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  return c.json({
    error: c.env.ENVIRONMENT === 'production'
      ? 'Internal server error'
      : err.message
  }, 500);
});

// ═══════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════

export default {
  fetch: app.fetch,

  // Queue consumer for async AI processing
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleAIQueue(batch, env);
  },

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const hour = new Date().getUTCHours();

    switch (event.cron) {
      case '0 * * * *':
        // Hourly: Check for daily digests to send
        console.log('Running hourly digest check');
        // await sendDueDigests(env);
        break;

      case '0 3 * * *':
        // 3am UTC: Nightly health recalculation
        console.log('Running nightly health recalculation');
        // await recalculateAllHealth(env);
        break;

      default:
        console.log(`Unknown cron trigger: ${event.cron}`);
    }
  }
};
