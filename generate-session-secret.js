#!/usr/bin/env node

/**
 * Generate a secure SESSION_SECRET for deployment
 * 
 * Usage: node generate-session-secret.js
 */

const crypto = require('crypto');

// Generate a secure 32-byte random string
const sessionSecret = crypto.randomBytes(32).toString('hex');

console.log('='.repeat(60));
console.log('GENERATED SESSION_SECRET FOR DEPLOYMENT:');
console.log('='.repeat(60));
console.log();
console.log(sessionSecret);
console.log();
console.log('NEXT STEPS:');
console.log('1. Copy the generated secret above');
console.log('2. Go to your Replit workspace');
console.log('3. Click the "Secrets" tab (lock icon)');
console.log('4. Click "New Secret"');
console.log('5. Key: SESSION_SECRET');
console.log('6. Value: Paste the generated secret');
console.log('7. Click "Add Secret"');
console.log('8. Redeploy your application');
console.log();
console.log('='.repeat(60));