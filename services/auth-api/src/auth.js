import { verifyAccessToken } from './session.js';

export function authenticatedUser(request, config) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return verifyAccessToken(token, config.jwtSecret);
}

export function requireUser(request, reply, config, allowedRoles = null) {
  const claims = authenticatedUser(request, config);
  if (!claims) {
    reply.code(401).send({ error: 'unauthorized', message: 'ورود لازم است.' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(claims.role)) {
    reply.code(403).send({ error: 'forbidden', message: 'اجازهٔ انجام این عملیات را ندارید.' });
    return null;
  }
  return claims;
}

/**
 * requireUser plus a live account-state check. A JSON web token stays valid for its full
 * lifetime, so a suspension or deactivation only takes effect if every authenticated route
 * re-reads users.is_active. This is the single enforcement point for that.
 */
export async function requireActiveUser(request, reply, config, pool, allowedRoles = null) {
  const claims = requireUser(request, reply, config, allowedRoles);
  if (!claims) return null;
  const { rows } = await pool.query('SELECT is_active FROM users WHERE id = $1', [claims.sub]);
  if (!rows[0]?.is_active) {
    reply.code(401).send({ error: 'account_inactive', message: 'حساب کاربری فعال نیست.' });
    return null;
  }
  return claims;
}
