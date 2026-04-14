const Stripe = require('stripe');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2024-06-20' }) : null;

function assertConfigured() {
  if (!stripe) {
    throw new Error('Stripe is not configured: missing STRIPE_SECRET_KEY');
  }
}

async function getOrCreateCustomer({ user }) {
  assertConfigured();
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { user_id: String(user.id) },
  });
  return customer.id;
}

async function createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, userId }) {
  assertConfigured();
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    client_reference_id: String(userId),
    metadata: { user_id: String(userId) },
    subscription_data: { trial_period_days: 7 },
  });
}

async function retrieveSubscription(subscriptionId) {
  assertConfigured();
  return stripe.subscriptions.retrieve(subscriptionId);
}

async function cancelSubscriptionAtPeriodEnd(subscriptionId) {
  assertConfigured();
  return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

function constructWebhookEvent(rawBody, signature) {
  assertConfigured();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

function isConfigured() {
  return !!stripe;
}

module.exports = {
  getOrCreateCustomer,
  createCheckoutSession,
  retrieveSubscription,
  cancelSubscriptionAtPeriodEnd,
  constructWebhookEvent,
  isConfigured,
};
