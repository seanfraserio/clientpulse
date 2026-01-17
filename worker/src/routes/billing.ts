import { Hono } from 'hono';
import Stripe from 'stripe';
import { PRICING_TIERS, getTierByPlan } from '@shared/billing';
import type { AppEnv } from '../index';
import type { User } from '@shared/types';

const billing = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// GET /api/billing/subscription - Get current subscription status
// ═══════════════════════════════════════════════════════════

billing.get('/subscription', async (c) => {
  const user = c.get('user') as User;
  const tier = getTierByPlan(user.plan);

  let subscription = null;

  if (user.stripe_subscription_id) {
    try {
      const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
      const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

      subscription = {
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end
      };
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      // Subscription may have been deleted
    }
  }

  return c.json({
    plan: user.plan,
    planPeriod: user.plan_period,
    tier,
    subscription
  });
});

// ═══════════════════════════════════════════════════════════
// GET /api/billing/pricing - Get pricing tiers
// ═══════════════════════════════════════════════════════════

billing.get('/pricing', async (c) => {
  return c.json({ tiers: Object.values(PRICING_TIERS) });
});

// ═══════════════════════════════════════════════════════════
// POST /api/billing/checkout - Create Stripe checkout session
// ═══════════════════════════════════════════════════════════

billing.post('/checkout', async (c) => {
  const user = c.get('user') as User;
  const { priceId } = await c.req.json();

  if (!priceId) {
    return c.json({ error: 'Price ID required' }, 400);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  // Get or create Stripe customer
  let customerId = user.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        user_id: user.id
      }
    });

    customerId = customer.id;

    // Save customer ID
    await c.env.DB.prepare(`
      UPDATE users SET stripe_customer_id = ? WHERE id = ?
    `).bind(customerId, user.id).run();
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    success_url: `${c.env.APP_URL}/settings/billing?success=true`,
    cancel_url: `${c.env.APP_URL}/settings/billing?cancelled=true`,
    subscription_data: {
      metadata: {
        user_id: user.id
      }
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: true }
  });

  return c.json({ url: session.url });
});

// ═══════════════════════════════════════════════════════════
// POST /api/billing/portal - Create Stripe customer portal session
// ═══════════════════════════════════════════════════════════

billing.post('/portal', async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_customer_id) {
    return c.json({ error: 'No billing account found' }, 400);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${c.env.APP_URL}/settings/billing`
  });

  return c.json({ url: session.url });
});

// ═══════════════════════════════════════════════════════════
// POST /api/billing/cancel - Cancel subscription
// ═══════════════════════════════════════════════════════════

billing.post('/cancel', async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_subscription_id) {
    return c.json({ error: 'No active subscription' }, 400);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  await stripe.subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: true
  });

  return c.json({
    success: true,
    message: 'Subscription will cancel at the end of the current billing period'
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/billing/resume - Resume cancelled subscription
// ═══════════════════════════════════════════════════════════

billing.post('/resume', async (c) => {
  const user = c.get('user') as User;

  if (!user.stripe_subscription_id) {
    return c.json({ error: 'No subscription to resume' }, 400);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  await stripe.subscriptions.update(user.stripe_subscription_id, {
    cancel_at_period_end: false
  });

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
// GET /api/billing/usage - Get usage stats for current period
// ═══════════════════════════════════════════════════════════

billing.get('/usage', async (c) => {
  const user = c.get('user') as User;
  const tier = getTierByPlan(user.plan);
  const period = new Date().toISOString().slice(0, 7);

  interface UsageRecord {
    notes_created: number;
    ai_requests: number;
    search_queries: number;
  }

  const usage = await c.env.DB.prepare(`
    SELECT * FROM usage_tracking WHERE user_id = ? AND period = ?
  `).bind(user.id, period).first<UsageRecord>();

  return c.json({
    period,
    usage: {
      notes: {
        used: usage?.notes_created || 0,
        limit: tier.limits.maxNotesPerMonth,
        percent: Math.round(((usage?.notes_created || 0) / tier.limits.maxNotesPerMonth) * 100)
      },
      clients: {
        used: user.clients_count,
        limit: tier.limits.maxClients,
        percent: Math.round((user.clients_count / tier.limits.maxClients) * 100)
      },
      aiRequests: usage?.ai_requests || 0,
      searchQueries: usage?.search_queries || 0
    }
  });
});

export default billing;
