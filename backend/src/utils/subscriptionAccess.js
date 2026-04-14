function hasPremiumAccess(subscriptionStatus) {
  return subscriptionStatus === 'active'
    || subscriptionStatus === 'trial'
    || subscriptionStatus === 'trialing';
}

module.exports = {
  hasPremiumAccess,
};
