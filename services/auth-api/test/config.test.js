import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';

const VALID = {
  DATABASE_URL: 'postgres://oosta:pw@127.0.0.1:5432/oosta_auth',
  JWT_SECRET: 'test-only-jwt-secret-with-sufficient-entropy',
  OTP_PEPPER: 'test-only-otp-pepper-with-sufficient-entropy',
  KAVENEGAR_API_KEY: 'test-kavenegar-key',
  KAVENEGAR_TEMPLATE: 'OOSTA_TEST'
};

function withEnv(overrides, fn) {
  const saved = { ...process.env };
  for (const key of Object.keys({ ...VALID, ...overrides })) delete process.env[key];
  Object.assign(process.env, VALID, overrides);
  try {
    return fn();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

test('loadConfig permits the development OTP log when the environment is not production-like', () => {
  withEnv({ OTP_DEV_LOG_CODE: 'true', NODE_ENV: 'development' }, () => {
    assert.equal(loadConfig().devLogCode, true);
  });
});

test('loadConfig refuses to log plaintext OTP codes in production', () => {
  withEnv({ OTP_DEV_LOG_CODE: 'true', NODE_ENV: 'production' }, () => {
    assert.throws(() => loadConfig(), /OTP_DEV_LOG_CODE must not be enabled/);
  });
});

test('loadConfig refuses to log plaintext OTP codes in staging', () => {
  withEnv({ OTP_DEV_LOG_CODE: 'true', NODE_ENV: 'staging' }, () => {
    assert.throws(() => loadConfig(), /OTP_DEV_LOG_CODE must not be enabled/);
  });
});

test('loadConfig still rejects placeholder secrets outright', () => {
  withEnv({ JWT_SECRET: 'replace-with-openssl-rand-base64-48' }, () => {
    assert.throws(() => loadConfig(), /Missing required environment variable: JWT_SECRET/);
  });
});

test('loadConfig refuses to enable payments without a merchant id and an HTTPS callback', () => {
  withEnv({ FEATURE_PAYMENTS: 'true', ZARINPAL_MERCHANT_ID: '', PAYMENT_CALLBACK_BASE_URL: 'http://api.example.com' }, () => {
    assert.throws(() => loadConfig(), /FEATURE_PAYMENTS needs ZARINPAL_MERCHANT_ID and an HTTPS PAYMENT_CALLBACK_BASE_URL/);
  });
});
