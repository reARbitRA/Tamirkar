import jwt from 'jsonwebtoken';

export function authenticatedUser(request, config) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: 'oosta-auth-api',
      audience: 'oosta-android'
    });
  } catch {
    return null;
  }
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
