import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFeatures } from '../src/feature-flags.js';

test('public feature response is fail-closed from server configuration', () => {
  assert.deepEqual(
    publicFeatures({
      aiEnabled: false,
      newBookingsEnabled: false,
      paymentsEnabled: false,
      technicianMatchingEnabled: false,
      escrowReleaseEnabled: false
    }),
    {
      ai_diagnosis: false,
      new_bookings: false,
      payments: false,
      technician_matching: false,
      escrow_release: false
    }
  );
});

test('public feature response contains no secret or provider configuration', () => {
  const response = publicFeatures({
    aiEnabled: true,
    newBookingsEnabled: true,
    paymentsEnabled: true,
    technicianMatchingEnabled: true,
    escrowReleaseEnabled: true,
    geminiApiKey: 'must-not-leak',
    zarinpalMerchantId: 'must-not-leak'
  });
  assert.equal(JSON.stringify(response).includes('must-not-leak'), false);
});
