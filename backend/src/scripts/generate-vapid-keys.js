const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('VAPID Keys Generated');
console.log('====================');
console.log();
console.log('Add these to your Railway environment variables:');
console.log();
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:hello@learnstack.dev`);
console.log();
console.log('Also add the public key to your frontend environment:');
console.log();
console.log(`VITE_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
