import jwt from 'jsonwebtoken';

const ISSUER = 'oosta-auth-api';
const AUDIENCE = 'oosta-android';
const ACCESS_TOKEN_SECONDS = 60 * 60;
const ROLES = new Set(['customer', 'technician', 'operator', 'admin']);

/**
 * Issues a short-lived, least-privilege API token. Phone numbers and other profile
 * fields stay server-side; clients receive them only in the explicit auth/me response.
 */
export function issueAccessToken({ userId, role, jwtSecret, expiresInSeconds = ACCESS_TOKEN_SECONDS }) {
  if (!userId || !ROLES.has(role)) throw new Error('cannot issue token for an invalid user');
  return {
    expiresInSeconds,
    accessToken: jwt.sign({ sub: userId, role }, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
      issuer: ISSUER,
      audience: AUDIENCE
    })
  };
}

/** Validates both the signature and the minimal claims that authorize API operations. */
export function verifyAccessToken(token, jwtSecret) {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE
    });
    if (!claims || typeof claims !== 'object' || typeof claims.sub !== 'string' || !ROLES.has(claims.role)) return null;
    return { sub: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}
