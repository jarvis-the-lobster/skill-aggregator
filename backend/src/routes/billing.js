const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../models/database');
const stripeService = require('../services/stripeService');

const router = express.Router();

function toIsoOrNull(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

function mapSubscriptionStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'free';
  }
}

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    if (!stripeService.isConfigured()) {
      return res.status(503).json({ error: 'Billing is not configured' });
    }
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      return res.status(500).json({ error: 'Missing STRIPE_PRICE_ID' });
    }

    const user = req.user;
    let customerId = user.stripe_customer_id;
    if (customerId) {
      // Verify the customer still exists in Stripe (handles test→live mode switch)
      try {
        await stripeService.retrieveCustomer(customerId);
      } catch (err) {
        if (err.code === 'resource_missing') {
          console.warn(`Stale Stripe customer ID for user ${user.id}, creating new customer`);
          customerId = null;
          await db.setStripeCustomerId(user.id, null);
        } else {
          throw err;
        }
      }
    }
    if (!customerId) {
      customerId = await stripeService.getOrCreateCustomer({ user });
      await db.setStripeCustomerId(user.id, customerId);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await stripeService.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${frontendUrl}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/premium`,
      userId: user.id,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('create-checkout-session error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  const user = await db.getUserById(req.user.id);
  res.json({
    status: user?.subscription_status || 'free',
    isPremium: user?.subscription_status === 'active',
    subscriptionEndDate: user?.subscription_end_date || null,
    subscriptionId: user?.subscription_id || null,
  });
});

router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user?.subscription_id) {
      return res.status(400).json({ error: 'No active subscription' });
    }
    const sub = await stripeService.cancelSubscriptionAtPeriodEnd(user.subscription_id);
    await db.updateUserSubscription(user.id, {
      subscription_status: 'cancelled',
      subscription_id: sub.id,
      subscription_end_date: toIsoOrNull(sub.current_period_end),
    });
    res.json({ ok: true, subscriptionEndDate: toIsoOrNull(sub.current_period_end) });
  } catch (err) {
    console.error('cancel error:', err.message);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

async function handleWebhookEvent(event) {
  const type = event.type;
  const obj = event.data.object;

  if (type === 'checkout.session.completed') {
    const userId = obj.client_reference_id || obj.metadata?.user_id;
    const customerId = obj.customer;
    const subscriptionId = obj.subscription;
    if (!userId) return;
    if (customerId) {
      await db.setStripeCustomerId(Number(userId), customerId);
    }
    if (subscriptionId) {
      const sub = await stripeService.retrieveSubscription(subscriptionId);
      await db.updateUserSubscription(Number(userId), {
        subscription_status: mapSubscriptionStatus(sub.status),
        subscription_id: sub.id,
        subscription_end_date: toIsoOrNull(sub.current_period_end),
      });
    }
    return;
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const user = await db.getUserByStripeCustomerId(obj.customer);
    if (!user) return;
    const status = type === 'customer.subscription.deleted'
      ? 'cancelled'
      : mapSubscriptionStatus(obj.status);
    await db.updateUserSubscription(user.id, {
      subscription_status: status,
      subscription_id: obj.id,
      subscription_end_date: toIsoOrNull(obj.current_period_end),
    });
    return;
  }

  if (type === 'invoice.payment_failed') {
    const user = await db.getUserByStripeCustomerId(obj.customer);
    if (!user) return;
    await db.updateUserSubscription(user.id, {
      subscription_status: 'past_due',
      subscription_id: user.subscription_id || null,
      subscription_end_date: user.subscription_end_date || null,
    });
  }
}

const webhookHandler = async (req, res) => {
  if (!stripeService.isConfigured()) {
    return res.status(503).send('Billing not configured');
  }
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripeService.constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
};

module.exports = { router, webhookHandler };
