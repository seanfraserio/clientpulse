# ClientPulse Deployment Guide

This guide covers deploying ClientPulse to Cloudflare's edge network.

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account with Workers, D1, KV, and Queues enabled
- Stripe account (for billing)
- Google AI Studio account (for Gemini API fallback)

## Quick Start

```bash
# 1. Clone and install
cd clientpulse
npm install
cd worker && npm install && cd ..

# 2. Login to Cloudflare
wrangler login

# 3. Run setup (creates D1, KV, Queue)
chmod +x scripts/*.sh
./scripts/setup.sh

# 4. Set secrets
cd worker
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put SESSION_SECRET
cd ..

# 5. Deploy everything
./scripts/deploy.sh
```

## Detailed Setup

### 1. Cloudflare Resources

The setup script creates these resources automatically:

| Resource | Name | Purpose |
|----------|------|---------|
| D1 Database | `clientpulse-db` | Primary data store |
| KV Namespace | `RATE_LIMITS` | Rate limiting cache |
| Queue | `ai-processing-queue` | Async AI processing |

#### Manual Creation (if needed)

```bash
# D1 Database
wrangler d1 create clientpulse-db

# KV Namespace
wrangler kv:namespace create RATE_LIMITS

# Queue
wrangler queues create ai-processing-queue
```

### 2. Configure wrangler.toml

Update `worker/wrangler.toml` with your resource IDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "clientpulse-db"
database_id = "your-actual-d1-id"  # ← Update this

[[kv_namespaces]]
binding = "RATE_LIMITS"
id = "your-actual-kv-id"  # ← Update this
```

### 3. Set Secrets

Secrets must never be in code. Set them via Wrangler:

```bash
cd worker

# Stripe keys (from dashboard.stripe.com)
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET

# AI fallback (from aistudio.google.com)
wrangler secret put GEMINI_API_KEY

# Session encryption (generate: openssl rand -hex 32)
wrangler secret put SESSION_SECRET
```

### 4. Stripe Configuration

1. **Create Products** in Stripe Dashboard:
   - Pro Plan ($12/month, $99/year)
   - Team Plan ($29/month, $249/year)

2. **Update Price IDs** in `shared/billing.ts`:
   ```typescript
   pro: {
     stripePriceIdMonthly: 'price_your_pro_monthly',
     stripePriceIdYearly: 'price_your_pro_yearly',
   }
   ```

3. **Configure Webhook**:
   - Endpoint: `https://your-worker.workers.dev/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`

### 5. Deploy

```bash
# Deploy everything
./scripts/deploy.sh

# Or deploy separately
./scripts/deploy-worker.sh
./scripts/deploy-frontend.sh
```

## Environment-Specific Deployment

### Staging

```bash
./scripts/deploy.sh staging
```

Add a `[env.staging]` section to `wrangler.toml` for staging-specific config.

### Production

```bash
./scripts/deploy.sh production
```

## Database Migrations

```bash
# Local development
./scripts/migrate.sh local

# Production (with confirmation)
./scripts/migrate.sh remote
```

## Local Development

```bash
# Start both frontend and worker
./scripts/dev.sh

# Frontend: http://localhost:4321
# Worker: http://localhost:8787
```

The dev script:
- Sets up local D1 with the schema
- Starts Wrangler in local mode
- Runs Astro dev server
- Proxies API requests to the worker

## Monitoring

### Logs

```bash
# Real-time worker logs
wrangler tail

# Filter by status
wrangler tail --status error
```

### Queue Monitoring

```bash
# View queue status
wrangler queues list

# View pending messages
wrangler queues consumers ai-processing-queue
```

### D1 Analytics

View in Cloudflare Dashboard → D1 → Analytics

## Troubleshooting

### "Database not found"

Run migrations:
```bash
wrangler d1 execute clientpulse-db --file=worker/src/db/schema.sql --remote
```

### "Rate limit exceeded"

Check KV namespace is correctly bound in wrangler.toml.

### "AI processing stuck"

1. Check queue consumer is running
2. Verify Gemini API key is set
3. Check worker logs for errors

### "Stripe webhook failing"

1. Verify webhook secret matches
2. Check endpoint URL is correct
3. Ensure events are selected in Stripe Dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Pages      │    │   Workers    │    │   D1         │  │
│  │   (Frontend) │───▶│   (API)      │───▶│   (SQLite)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                             │                    ▲          │
│                             ▼                    │          │
│  ┌──────────────┐    ┌──────────────┐           │          │
│  │   KV         │    │   Queues     │───────────┘          │
│  │   (Cache)    │    │   (Async AI) │                      │
│  └──────────────┘    └──────────────┘                      │
│                             │                               │
│                             ▼                               │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │ Workers AI   │◀──▶│   Gemini     │                      │
│  │ (Primary)    │    │   (Fallback) │                      │
│  └──────────────┘    └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Cost Estimation

| Resource | Free Tier | Estimated Usage |
|----------|-----------|-----------------|
| Workers | 100K req/day | ~10K req/day |
| D1 | 5M rows read/day | ~50K rows/day |
| KV | 100K reads/day | ~20K reads/day |
| Queues | 1M messages/month | ~10K msg/month |
| Workers AI | Varies | ~5K calls/month |

Most small-medium deployments will stay within free tiers.
