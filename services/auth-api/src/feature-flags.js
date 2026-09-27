export const FEATURE_NAMES = Object.freeze([
  'ai_diagnosis',
  'new_bookings',
  'payments',
  'technician_matching',
  'escrow_release'
]);

export function publicFeatures(config) {
  return {
    ai_diagnosis: config.aiEnabled,
    new_bookings: config.newBookingsEnabled,
    payments: config.paymentsEnabled,
    technician_matching: config.technicianMatchingEnabled,
    escrow_release: config.escrowReleaseEnabled
  };
}
