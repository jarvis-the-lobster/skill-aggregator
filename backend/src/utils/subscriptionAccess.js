// Valid DB statuses: 'free' | 'active' | 'cancelled' | 'past_due'
// Stripe's 'trialing' is normalized to 'active' by mapSubscriptionStatus() in billing.js
// before being written to the DB, so it should never appear here.
function hasPremiumAccess(subscriptionStatus) {
  return subscriptionStatus === 'active';
}

module.exports = {
  hasPremiumAccess,
};
