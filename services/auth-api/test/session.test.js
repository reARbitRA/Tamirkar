import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { issueAccessToken, verifyAccessToken } from '../src/session.js';

const secret = 'test-only-session-secret-with-sufficient-length';
const userId = '11111111-1111-4111-8111-111111111111';

test('access token contains only the minimal identity and role claims', () => {
  const session = issueAccessToken({ userId, role: 'customer', jwtSecret: secret });
  const payload = jwt.decode(session.accessToken);

  assert.equal(session.expiresInSeconds, 60 * 60);
  assert.equal(payload.sub, userId);
  assert.equal(payload.role, 'customer');
  assert.equal(Object.hasOwn(payload, 'phone'), false);
  assert.equal(Object.hasOwn(payload, 'phone_e164'), false);
});

test('verified access token returns only supported authorization claims', () => {
  const { accessToken } = issueAccessToken({ userId, role: 'technician', jwtSecret: secret });
  assert.deepEqual(verifyAccessToken(accessToken, secret), { sub: userId, role: 'technician' });
});

test('invalid role claim is rejected even with a valid signature', () => {
  const token = jwt.sign({ sub: userId, role: 'unknown' }, secret, {
    algorithm: 'HS256', issuer: 'oosta-auth-api', audience: 'oosta-android', expiresIn: 60
  });
  assert.equal(verifyAccessToken(token, secret), null);
});
