import crypto from 'node:crypto';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { loadConfig } from './config.js';
import { sendKavenegarOtp } from './kavenegar.js';
import { latinDigits, normalizeIranMobile } from './phone.js';
import { generateOtp, hashOtp, otpMatches } from './otp.js';

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_SEND_WINDOW_MINUTES = 15;

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    reply.header('access-control-allow-origin', origin);
    reply.header('vary', 'Origin');
  }
  reply.header('x-content-type-options', 'nosniff');
  reply.header('cache-control', 'no-store');
  if (request.method === 'OPTIONS') {
    reply.header('access-control-allow-methods', 'POST, GET, OPTIONS');
    reply.header('access-control-allow-headers', 'authorization, content-type');
    return reply.code(204).send();
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'Unhandled auth API error');
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ error: 'invalid_request', message: 'درخواست معتبر نیست.' });
  }
  return reply.code(500).send({ error: 'internal_error', message: 'خطای موقت رخ داد. لطفاً دوباره تلاش کنید.' });
});

function requirePhone(body) {
  const phone = normalizeIranMobile(body?.phone);
  if (!phone) {
    const error = new Error('invalid phone');
    error.statusCode = 400;
    throw error;
  }
  return phone;
}

function requireCode(body) {
  const code = latinDigits(body?.code).trim();
  if (!/^\d{6}$/.test(code)) {
    const error = new Error('invalid code');
    error.statusCode = 400;
    throw error;
  }
  return code;
}

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok' };
});

app.post('/v1/auth/request-otp', async (request, reply) => {
  const phone = requirePhone(request.body);
  const client = await pool.connect();
  let challengeId;
  let code;
  try {
    await client.query('BEGIN');
    // A transaction-scoped advisory lock makes concurrent sends for one number deterministic.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);

    const { rows: recent } = await client.query(
      `SELECT id, status, sent_at, created_at
       FROM otp_challenges
       WHERE phone_e164 = $1
         AND created_at > NOW() - ($2 * INTERVAL '1 minute')
       ORDER BY created_at DESC`,
      [phone, OTP_SEND_WINDOW_MINUTES]
    );

    const newest = recent[0];
    if (newest?.sent_at && (Date.now() - new Date(newest.sent_at).getTime()) < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      await client.query('ROLLBACK');
      return reply.code(429).send({
        error: 'resend_too_soon',
        message: 'لطفاً یک دقیقه برای ارسال دوبارهٔ کد صبر کنید.',
        retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS
      });
    }
    if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
      await client.query('ROLLBACK');
      return reply.code(429).send({
        error: 'too_many_requests',
        message: 'تعداد درخواست کد زیاد است. چند دقیقه دیگر دوباره تلاش کنید.',
        retry_after_seconds: OTP_SEND_WINDOW_MINUTES * 60
      });
    }

    challengeId = crypto.randomUUID();
    code = generateOtp();
    await client.query(
      `INSERT INTO otp_challenges
        (id, phone_e164, code_hash, status, expires_at)
       VALUES ($1, $2, $3, 'sending', NOW() + ($4 * INTERVAL '1 minute'))`,
      [challengeId, phone, hashOtp({ phone, code, pepper: config.otpPepper }), OTP_EXPIRY_MINUTES]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  try {
    let providerMessageId = 'development';
    if (config.devLogCode) {
      request.log.warn({ phone, code }, 'OTP development mode — code is deliberately logged only locally');
    } else {
      providerMessageId = await sendKavenegarOtp({
        apiKey: config.kavenegarApiKey,
        template: config.kavenegarTemplate,
        // Kavenegar templates accept Iranian mobile recipients in their local 09… form.
        receptor: `0${phone.slice(3)}`,
        token: code
      });
    }
    await pool.query(
      `UPDATE otp_challenges SET status = 'pending', sent_at = NOW(), provider_message_id = $2 WHERE id = $1`,
      [challengeId, providerMessageId]
    );
  } catch (error) {
    await pool.query(`UPDATE otp_challenges SET status = 'failed', failure_reason = $2 WHERE id = $1`, [challengeId, String(error.message).slice(0, 500)]);
    request.log.error({ err: error, phone }, 'OTP provider delivery failed');
    return reply.code(502).send({
      error: 'sms_unavailable',
      message: 'ارسال پیامک موقتاً ممکن نیست. لطفاً چند دقیقه دیگر دوباره تلاش کنید.'
    });
  }

  return reply.code(202).send({
    message: 'اگر شماره معتبر باشد، کد تأیید ارسال می‌شود.',
    expires_in_seconds: OTP_EXPIRY_MINUTES * 60,
    resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS
  });
});

app.post('/v1/auth/verify-otp', async (request, reply) => {
  const phone = requirePhone(request.body);
  const code = requireCode(request.body);
  const client = await pool.connect();
  let user;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    const { rows } = await client.query(
      `SELECT * FROM otp_challenges
       WHERE phone_e164 = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [phone]
    );
    const challenge = rows[0];
    if (!challenge) {
      await client.query('ROLLBACK');
      return reply.code(401).send({ error: 'invalid_code', message: 'کد تأیید معتبر نیست یا منقضی شده است.' });
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE otp_challenges SET status = 'expired' WHERE id = $1`, [challenge.id]);
      await client.query('COMMIT');
      return reply.code(401).send({ error: 'expired_code', message: 'زمان کد تأیید تمام شده است. کد جدید دریافت کنید.' });
    }
    if (challenge.attempts >= challenge.max_attempts) {
      await client.query(`UPDATE otp_challenges SET status = 'locked' WHERE id = $1`, [challenge.id]);
      await client.query('COMMIT');
      return reply.code(429).send({ error: 'too_many_attempts', message: 'تعداد تلاش‌ها زیاد است. کد جدید دریافت کنید.' });
    }
    if (!otpMatches({ expectedHash: challenge.code_hash, phone, code, pepper: config.otpPepper })) {
      const attempts = challenge.attempts + 1;
      await client.query(`UPDATE otp_challenges SET attempts = $2, status = CASE WHEN $2 >= max_attempts THEN 'locked' ELSE status END WHERE id = $1`, [challenge.id, attempts]);
      await client.query('COMMIT');
      return reply.code(401).send({ error: 'invalid_code', message: 'کد تأیید صحیح نیست.' });
    }

    await client.query(`UPDATE otp_challenges SET status = 'verified', verified_at = NOW() WHERE id = $1`, [challenge.id]);
    const existing = await client.query(`SELECT id, phone_e164, role FROM users WHERE phone_e164 = $1 FOR UPDATE`, [phone]);
    if (existing.rows[0]) {
      user = existing.rows[0];
      await client.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    } else {
      user = { id: crypto.randomUUID(), phone_e164: phone, role: 'customer' };
      await client.query(
        `INSERT INTO users (id, phone_e164, role, last_login_at) VALUES ($1, $2, $3, NOW())`,
        [user.id, user.phone_e164, user.role]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const expiresInSeconds = 60 * 60;
  const accessToken = jwt.sign({ sub: user.id, role: user.role, phone: user.phone_e164 }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: expiresInSeconds,
    issuer: 'oosta-auth-api',
    audience: 'oosta-android'
  });
  return reply.send({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in_seconds: expiresInSeconds,
    user: { id: user.id, phone: user.phone_e164, role: user.role }
  });
});

app.get('/v1/me', async (request, reply) => {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return reply.code(401).send({ error: 'unauthorized', message: 'ورود لازم است.' });
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'oosta-auth-api', audience: 'oosta-android' });
    const { rows } = await pool.query(`SELECT id, phone_e164, role, is_active FROM users WHERE id = $1`, [claims.sub]);
    const user = rows[0];
    if (!user?.is_active) return reply.code(401).send({ error: 'unauthorized', message: 'حساب کاربری فعال نیست.' });
    return { user: { id: user.id, phone: user.phone_e164, role: user.role } };
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: 'نشست شما معتبر نیست. دوباره وارد شوید.' });
  }
});

async function closeGracefully(signal) {
  app.log.info({ signal }, 'Stopping auth API');
  await app.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => closeGracefully('SIGTERM'));
process.on('SIGINT', () => closeGracefully('SIGINT'));

app.listen({ port: config.port, host: config.host }).catch(async (error) => {
  app.log.error(error);
  await pool.end();
  process.exit(1);
});
