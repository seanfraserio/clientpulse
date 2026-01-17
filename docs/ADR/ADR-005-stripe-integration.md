# ADR-005: Stripe Payment Integration

## Status
**Accepted** - January 17, 2026

## Context
ClientPulse needs a payment system to support premium tiers. Requirements:
- Free tier with usage limits
- Pro tier with higher limits and features
- Easy upgrade/downgrade flow
- Subscription management (pause, cancel)
- Usage-based billing potential (future)

## Decision

Integrate Stripe for all payment processing using:
- **Stripe Checkout** for payment collection
- **Stripe Customer Portal** for self-service subscription management
- **Stripe Webhooks** for real-time subscription updates
- **Stripe Billing** for subscription lifecycle

### Pricing Tiers

```typescript
// shared/types/billing.ts

export interface PricingTier {
  id: 'free' | 'pro' | 'team';
  name: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  limits: TierLimits;
  features: string[];
}

export interface TierLimits {
  maxClients: number;
  maxNotesPerMonth: number;
  aiProcessingEnabled: boolean;
  semanticSearchEnabled: boolean;
  dailyDigestEnabled: boolean;
  briefingsEnabled: boolean;
  exportEnabled: boolean;
}

export const PRICING_TIERS: Record<string, PricingTier> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      maxClients: 5,
      maxNotesPerMonth: 20,
      aiProcessingEnabled: true,
      semanticSearchEnabled: false,
      dailyDigestEnabled: false,
      briefingsEnabled: false,
      exportEnabled: false
    },
    features: [
      'Up to 5 clients',
      '20 notes per month',
      'Basic health scoring',
      'Action item tracking'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 12,
    priceYearly: 99,  // ~2 months free
    stripePriceIdMonthly: 'price_pro_monthly',
    stripePriceIdYearly: 'price_pro_yearly',
    limits: {
      maxClients: 50,
      maxNotesPerMonth: 500,
      aiProcessingEnabled: true,
      semanticSearchEnabled: true,
      dailyDigestEnabled: true,
      briefingsEnabled: true,
      exportEnabled: true
    },
    features: [
      'Up to 50 clients',
      'Unlimited notes',
      'AI-powered insights',
      'Semantic search',
      'Daily email digest',
      'Pre-meeting briefings',
      'Data export'
    ]
  },
  team: {
    id: 'team',
    name: 'Team',
    priceMonthly: 29,
    priceYearly: 249,
    stripePriceIdMonthly: 'price_team_monthly',
    stripePriceIdYearly: 'price_team_yearly',
    limits: {
      maxClients: 200,
      maxNotesPerMonth: 2000,
      aiProcessingEnabled: true,
      semanticSearchEnabled: true,
      dailyDigestEnabled: true,
      briefingsEnabled: true,
      exportEnabled: true
    },
    features: [
      'Up to 200 clients',
      'Everything in Pro',
      'Priority support',
      'API access (coming soon)',
      'Custom integrations (coming soon)'
    ]
  }
};
```

### Database Schema Additions

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN plan_period TEXT DEFAULT 'monthly'
  CHECK (plan_period IN ('monthly', 'yearly'));

CREATE INDEX idx_users_stripe ON users(stripe_customer_id);

-- Subscription history for audit
CREATE TABLE subscription_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'created', 'updated', 'cancelled', 'renewed'
  stripe_event_id TEXT UNIQUE,
  previous_plan TEXT,
  new_plan TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  metadata TEXT,  -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sub_events_user ON subscription_events(user_id, created_at DESC);

-- Usage tracking for limits enforcement
CREATE TABLE usage_tracking (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,  -- '2026-01' format
  notes_created INTEGER DEFAULT 0,
  ai_requests INTEGER DEFAULT 0,
  search_queries INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, period)
);

CREATE INDEX idx_usage_user_period ON usage_tracking(user_id, period);
```

### Stripe Service

```typescript
// worker/src/services/stripe.ts

import Stripe from 'stripe';

export class StripeService {
  private stripe: Stripe;

  constructor(apiKey: string) {
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2024-12-18.acacia',
      typescript: true
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CUSTOMER MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async getOrCreateCustomer(user: User): Promise<Stripe.Customer> {
    if (user.stripe_customer_id) {
      return this.stripe.customers.retrieve(user.stripe_customer_id) as Promise<Stripe.Customer>;
    }

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        user_id: user.id
      }
    });

    // Update user with Stripe customer ID
    await db.prepare(`
      UPDATE users SET stripe_customer_id = ? WHERE id = ?
    `).bind(customer.id, user.id).run();

    return customer;
  }

  // ═══════════════════════════════════════════════════════════
  // CHECKOUT
  // ═══════════════════════════════════════════════════════════

  async createCheckoutSession(params: {
    user: User;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    const customer = await this.getOrCreateCustomer(params.user);

    return this.stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: params.priceId,
          quantity: 1
        }
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        metadata: {
          user_id: params.user.id
        }
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      tax_id_collection: { enabled: true }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CUSTOMER PORTAL
  // ═══════════════════════════════════════════════════════════

  async createPortalSession(params: {
    user: User;
    returnUrl: string;
  }): Promise<Stripe.BillingPortal.Session> {
    if (!params.user.stripe_customer_id) {
      throw new Error('User has no Stripe customer');
    }

    return this.stripe.billingPortal.sessions.create({
      customer: params.user.stripe_customer_id,
      return_url: params.returnUrl
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SUBSCRIPTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: atPeriodEnd
    });
  }

  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
  }

  // ═══════════════════════════════════════════════════════════
  // WEBHOOK HANDLING
  // ═══════════════════════════════════════════════════════════

  constructWebhookEvent(payload: string, signature: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
```

### Webhook Handler

```typescript
// worker/src/routes/webhooks.ts

import { Hono } from 'hono';
import { StripeService } from '../services/stripe';
import { PRICING_TIERS } from '../../shared/types/billing';

const webhooks = new Hono();

webhooks.post('/stripe', async (c) => {
  const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header('stripe-signature');
  const payload = await c.req.text();

  let event: Stripe.Event;

  try {
    event = stripe.constructWebhookEvent(
      payload,
      signature!,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(c.env.DB, session);
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(c.env.DB, subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCancelled(c.env.DB, subscription);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(c.env.DB, invoice);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentSucceeded(c.env.DB, invoice);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

async function handleCheckoutComplete(db: D1Database, session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) return;

  await db.prepare(`
    UPDATE users
    SET stripe_subscription_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(session.subscription, userId).run();
}

async function handleSubscriptionUpdate(db: D1Database, subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;

  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price.id;
  const plan = determinePlanFromPriceId(priceId);
  const isYearly = subscription.items.data[0]?.price.recurring?.interval === 'year';

  await db.prepare(`
    UPDATE users
    SET plan = ?,
        plan_period = ?,
        plan_expires_at = datetime(?, 'unixepoch'),
        stripe_subscription_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    plan,
    isYearly ? 'yearly' : 'monthly',
    subscription.current_period_end,
    subscription.id,
    userId
  ).run();

  // Log the event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, new_plan)
    VALUES (?, ?, 'updated', ?, ?)
  `).bind(generateId(), userId, subscription.id, plan).run();
}

async function handleSubscriptionCancelled(db: D1Database, subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;

  // Downgrade to free at period end
  await db.prepare(`
    UPDATE users
    SET plan = 'free',
        plan_expires_at = NULL,
        stripe_subscription_id = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(userId).run();

  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, new_plan)
    VALUES (?, ?, 'cancelled', ?, 'free')
  `).bind(generateId(), userId, subscription.id).run();
}

async function handlePaymentFailed(db: D1Database, invoice: Stripe.Invoice) {
  // Could send email notification, add grace period, etc.
  console.log(`Payment failed for invoice ${invoice.id}`);
}

async function handlePaymentSucceeded(db: D1Database, invoice: Stripe.Invoice) {
  // Update stats, send receipt, etc.
  const customerId = invoice.customer as string;

  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, amount_cents)
    SELECT ?, id, 'renewed', ?
    FROM users WHERE stripe_customer_id = ?
  `).bind(generateId(), invoice.amount_paid, customerId).run();
}

function determinePlanFromPriceId(priceId: string): string {
  for (const [planId, tier] of Object.entries(PRICING_TIERS)) {
    if (tier.stripePriceIdMonthly === priceId || tier.stripePriceIdYearly === priceId) {
      return planId;
    }
  }
  return 'free';
}

export default webhooks;
```

### API Routes for Billing

```typescript
// worker/src/routes/billing.ts

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { StripeService } from '../services/stripe';
import { PRICING_TIERS } from '../../shared/types/billing';

const billing = new Hono();

// Get current subscription status
billing.get('/subscription', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const tier = PRICING_TIERS[user.plan] || PRICING_TIERS.free;

  let subscription = null;
  if (user.stripe_subscription_id) {
    const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
    try {
      subscription = await stripe.getSubscription(user.stripe_subscription_id);
    } catch (e) {
      // Subscription may have been deleted
    }
  }

  return c.json({
    plan: user.plan,
    tier,
    subscription: subscription ? {
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    } : null
  });
});

// Get pricing tiers
billing.get('/pricing', async (c) => {
  return c.json({ tiers: Object.values(PRICING_TIERS) });
});

// Create checkout session
billing.post('/checkout', authMiddleware, async (c) => {
  const user = c.get('user') as User;
  const { priceId } = await c.req.json();

  if (!priceId) {
    return c.json({ error: 'Price ID required' }, 400);
  }

  const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
  const appUrl = c.env.APP_URL;

  const session = await stripe.createCheckoutSession({
    user,
    priceId,
    successUrl: `${appUrl}/settings/billing?success=true`,
    cancelUrl: `${appUrl}/settings/billing?cancelled=true`
  });

  return c.json({ url: session.url });
});

// Create portal session (manage subscription)
billing.post('/portal', authMiddleware, async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_customer_id) {
    return c.json({ error: 'No billing account found' }, 400);
  }

  const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
  const appUrl = c.env.APP_URL;

  const session = await stripe.createPortalSession({
    user,
    returnUrl: `${appUrl}/settings/billing`
  });

  return c.json({ url: session.url });
});

// Cancel subscription
billing.post('/cancel', authMiddleware, async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_subscription_id) {
    return c.json({ error: 'No active subscription' }, 400);
  }

  const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
  await stripe.cancelSubscription(user.stripe_subscription_id);

  return c.json({ success: true, message: 'Subscription will cancel at period end' });
});

// Resume cancelled subscription
billing.post('/resume', authMiddleware, async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_subscription_id) {
    return c.json({ error: 'No subscription to resume' }, 400);
  }

  const stripe = new StripeService(c.env.STRIPE_SECRET_KEY);
  await stripe.resumeSubscription(user.stripe_subscription_id);

  return c.json({ success: true });
});

export default billing;
```

### Usage Limits Enforcement

```typescript
// worker/src/middleware/usage-limits.ts

import { Context, Next } from 'hono';
import { PRICING_TIERS } from '../../shared/types/billing';

export async function checkUsageLimits(c: Context, next: Next) {
  const user = c.get('user') as User;
  const db = c.get('db') as TenantDB;
  const tier = PRICING_TIERS[user.plan] || PRICING_TIERS.free;

  // Check client limit
  if (c.req.path === '/api/clients' && c.req.method === 'POST') {
    const clientCount = await db.getClientCount();
    if (clientCount >= tier.limits.maxClients) {
      return c.json({
        error: 'Client limit reached',
        limit: tier.limits.maxClients,
        upgrade_url: '/settings/billing'
      }, 403);
    }
  }

  // Check notes limit (monthly)
  if (c.req.path === '/api/notes' && c.req.method === 'POST') {
    const period = new Date().toISOString().slice(0, 7); // '2026-01'
    const usage = await getUsage(c.env.DB, user.id, period);

    if (usage.notes_created >= tier.limits.maxNotesPerMonth) {
      return c.json({
        error: 'Monthly note limit reached',
        limit: tier.limits.maxNotesPerMonth,
        resets: getNextMonth(),
        upgrade_url: '/settings/billing'
      }, 403);
    }
  }

  // Check feature access
  if (c.req.path === '/api/search' && !tier.limits.semanticSearchEnabled) {
    return c.json({
      error: 'Semantic search is a Pro feature',
      upgrade_url: '/settings/billing'
    }, 403);
  }

  await next();

  // Increment usage counters after successful requests
  if (c.res.status < 400) {
    await incrementUsage(c.env.DB, user.id, c.req.path, c.req.method);
  }
}

async function getUsage(db: D1Database, userId: string, period: string) {
  const result = await db.prepare(`
    SELECT * FROM usage_tracking WHERE user_id = ? AND period = ?
  `).bind(userId, period).first();

  return result || { notes_created: 0, ai_requests: 0, search_queries: 0 };
}

async function incrementUsage(db: D1Database, userId: string, path: string, method: string) {
  const period = new Date().toISOString().slice(0, 7);

  let column: string | null = null;
  if (path === '/api/notes' && method === 'POST') column = 'notes_created';
  if (path === '/api/search') column = 'search_queries';

  if (!column) return;

  await db.prepare(`
    INSERT INTO usage_tracking (id, user_id, period, ${column})
    VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, period) DO UPDATE SET
      ${column} = ${column} + 1,
      updated_at = CURRENT_TIMESTAMP
  `).bind(generateId(), userId, period).run();
}
```

### Wrangler Configuration Additions

```toml
# Add to wrangler.toml

[vars]
# ... existing vars
STRIPE_PUBLISHABLE_KEY = "pk_test_..." # Safe to expose

# Secrets (via wrangler secret put):
# STRIPE_SECRET_KEY
# STRIPE_WEBHOOK_SECRET
```

## Consequences

### Positive
- Industry-standard payment processing
- Self-service subscription management via Portal
- Automatic webhook handling for subscription lifecycle
- Support for promotions and discounts
- Easy to add new tiers or adjust pricing

### Negative
- Stripe fees: 2.9% + 30¢ per transaction
- Additional complexity for webhook handling
- Need to handle edge cases (payment failures, disputes)
- Requires webhook endpoint to be publicly accessible

### Security Considerations
- Webhook signature verification is critical
- Never log full payment details
- Use Stripe's test mode extensively before going live
- Implement idempotency for webhook handlers

## Implementation Checklist

- [ ] Create Stripe account and get API keys
- [ ] Set up products and prices in Stripe dashboard
- [ ] Add Stripe secrets to Wrangler
- [ ] Implement StripeService class
- [ ] Create webhook endpoint
- [ ] Add billing routes
- [ ] Create billing settings UI
- [ ] Implement usage tracking
- [ ] Add limit enforcement middleware
- [ ] Test with Stripe CLI locally
- [ ] Configure Stripe webhook in dashboard for production
