import { Hono } from 'hono';
import Stripe from 'stripe';
import { generateId } from '../utils/crypto';
import { PRICING_TIERS } from '@shared/billing';
import type { AppEnv } from '../index';

const webhooks = new Hono<AppEnv>();

// ═══════════════════════════════════════════════════════════
// POST /api/webhooks/stripe - Handle Stripe webhook events
// ═══════════════════════════════════════════════════════════

webhooks.post('/stripe', async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  const signature = c.req.header('stripe-signature');
  const payload = await c.req.text();

  // Return same generic response for all authentication failures
  // to prevent information disclosure to attackers
  const authFailedResponse = () => c.json({ error: 'Unauthorized' }, 401);

  if (!signature) {
    console.warn('[Webhook] Missing Stripe signature header');
    return authFailedResponse();
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    // Log minimally - don't expose error details that could help attackers
    console.warn('[Webhook] Signature verification failed');
    return authFailedResponse();
  }

  // Check for duplicate events (idempotency)
  const existing = await c.env.DB.prepare(`
    SELECT 1 FROM subscription_events WHERE stripe_event_id = ?
  `).bind(event.id).first();

  if (existing) {
    console.log(`Event ${event.id} already processed, skipping`);
    return c.json({ received: true });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(c.env.DB, event.data.object as Stripe.Checkout.Session, event.id);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(c.env.DB, event.data.object as Stripe.Subscription, event.id);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(c.env.DB, event.data.object as Stripe.Subscription, event.id);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(c.env.DB, event.data.object as Stripe.Invoice, event.id);
        break;

      case 'invoice.paid':
        await handlePaymentSucceeded(c.env.DB, event.data.object as Stripe.Invoice, event.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`Error handling ${event.type}:`, error);
    // Don't return error - Stripe will retry
  }

  return c.json({ received: true });
});

// ═══════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════

async function handleCheckoutComplete(
  db: D1Database,
  session: Stripe.Checkout.Session,
  eventId: string
) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error('Checkout session missing user_id metadata');
    return;
  }

  // Update user with subscription ID
  await db.prepare(`
    UPDATE users SET stripe_subscription_id = ? WHERE id = ?
  `).bind(session.subscription, userId).run();

  // Log event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, metadata)
    VALUES (?, ?, 'checkout_complete', ?, ?)
  `).bind(
    generateId(),
    userId,
    eventId,
    JSON.stringify({ session_id: session.id })
  ).run();

  console.log(`Checkout completed for user ${userId}`);
}

async function handleSubscriptionUpdate(
  db: D1Database,
  subscription: Stripe.Subscription,
  eventId: string
) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error('Subscription missing user_id metadata');
    return;
  }

  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price.id;
  const plan = determinePlanFromPriceId(priceId);
  const isYearly = subscription.items.data[0]?.price.recurring?.interval === 'year';

  // Get current plan for logging
  const user = await db.prepare(`SELECT plan FROM users WHERE id = ?`).bind(userId).first();
  const previousPlan = user?.plan || 'free';

  // Update user
  await db.prepare(`
    UPDATE users
    SET plan = ?,
        plan_period = ?,
        plan_expires_at = datetime(?, 'unixepoch'),
        stripe_subscription_id = ?
    WHERE id = ?
  `).bind(
    plan,
    isYearly ? 'yearly' : 'monthly',
    subscription.current_period_end,
    subscription.id,
    userId
  ).run();

  // Log event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, previous_plan, new_plan)
    VALUES (?, ?, 'subscription_updated', ?, ?, ?)
  `).bind(
    generateId(),
    userId,
    eventId,
    previousPlan,
    plan
  ).run();

  console.log(`Subscription updated for user ${userId}: ${previousPlan} -> ${plan}`);
}

async function handleSubscriptionDeleted(
  db: D1Database,
  subscription: Stripe.Subscription,
  eventId: string
) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error('Subscription missing user_id metadata');
    return;
  }

  // Get current plan for logging
  const user = await db.prepare(`SELECT plan FROM users WHERE id = ?`).bind(userId).first();
  const previousPlan = user?.plan || 'unknown';

  // Downgrade to free
  await db.prepare(`
    UPDATE users
    SET plan = 'free',
        plan_expires_at = NULL,
        stripe_subscription_id = NULL
    WHERE id = ?
  `).bind(userId).run();

  // Log event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, previous_plan, new_plan)
    VALUES (?, ?, 'subscription_cancelled', ?, ?, 'free')
  `).bind(
    generateId(),
    userId,
    eventId,
    previousPlan
  ).run();

  console.log(`Subscription cancelled for user ${userId}`);
}

async function handlePaymentFailed(
  db: D1Database,
  invoice: Stripe.Invoice,
  eventId: string
) {
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  const user = await db.prepare(`
    SELECT id FROM users WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!user) {
    console.error(`No user found for customer ${customerId}`);
    return;
  }

  // Log event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, metadata)
    VALUES (?, ?, 'payment_failed', ?, ?)
  `).bind(
    generateId(),
    user.id,
    eventId,
    JSON.stringify({
      invoice_id: invoice.id,
      amount: invoice.amount_due,
      attempt_count: invoice.attempt_count
    })
  ).run();

  // TODO: Send notification email about failed payment
  console.log(`Payment failed for user ${user.id}, attempt ${invoice.attempt_count}`);
}

async function handlePaymentSucceeded(
  db: D1Database,
  invoice: Stripe.Invoice,
  eventId: string
) {
  const customerId = invoice.customer as string;

  // Find user by Stripe customer ID
  const user = await db.prepare(`
    SELECT id FROM users WHERE stripe_customer_id = ?
  `).bind(customerId).first();

  if (!user) {
    console.error(`No user found for customer ${customerId}`);
    return;
  }

  // Log event
  await db.prepare(`
    INSERT INTO subscription_events (id, user_id, event_type, stripe_event_id, amount_cents, currency)
    VALUES (?, ?, 'payment_succeeded', ?, ?, ?)
  `).bind(
    generateId(),
    user.id,
    eventId,
    invoice.amount_paid,
    invoice.currency
  ).run();

  console.log(`Payment succeeded for user ${user.id}: ${invoice.amount_paid} ${invoice.currency}`);
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function determinePlanFromPriceId(priceId: string): string {
  for (const [planId, tier] of Object.entries(PRICING_TIERS)) {
    if (tier.stripePriceIdMonthly === priceId || tier.stripePriceIdYearly === priceId) {
      return planId;
    }
  }
  return 'free';
}

export default webhooks;
