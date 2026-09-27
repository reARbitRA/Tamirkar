import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOtp, hashOtp, otpMatches } from '../src/otp.js';

test('generates a six-digit OTP including leading zeroes when needed', () => {
  const otp = generateOtp();
  assert.match(otp, /^\d{6}$/);
});

test('compares OTP hashes without accepting a wrong code', () => {
  const phone = '+989121234567';
  const pepper = 'test-only-pepper';
  const expectedHash = hashOtp({ phone, code: '012345', pepper });
  assert.equal(otpMatches({ expectedHash, phone, code: '012345', pepper }), true);
  assert.equal(otpMatches({ expectedHash, phone, code: '012346', pepper }), false);
});
