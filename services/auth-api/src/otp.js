import crypto from 'node:crypto';

export function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp({ phone, code, pepper }) {
  return crypto.createHash('sha256').update(`${phone}:${code}:${pepper}`, 'utf8').digest('hex');
}

export function otpMatches({ expectedHash, phone, code, pepper }) {
  const suppliedHash = hashOtp({ phone, code, pepper });
  const expected = Buffer.from(expectedHash, 'hex');
  const supplied = Buffer.from(suppliedHash, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}
