import crypto from 'node:crypto';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { generateDiagnosis, AiUnavailableError } from './ai.js';
import { authenticatedUser, requireUser } from './auth.js';
import { loadConfig } from './config.js';
import { publicFeatures } from './feature-flags.js';
import { sendKavenegarOtp } from './kavenegar.js';
import { audit, postLedgerEntry } from './ledger.js';
import { latinDigits, normalizeIranMobile } from './phone.js';
import { generateOtp, hashOtp, otpMatches } from './otp.js';
import { createZarinpalPayment, verifyZarinpalPayment } from './zarinpal.js';

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_SEND_WINDOW_MINUTES = 15;
const DEFAULT_ESCROW_DAYS = 30;

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
const app = Fastify({ logger: true, bodyLimit: 3 * 1024 * 1024 });

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
    reply.header('access-control-allow-headers', 'authorization, content-type, idempotency-key');
    return reply.code(204).send();
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, 'Unhandled platform API error');
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

function requireIdempotencyKey(request) {
  const key = String(request.headers['idempotency-key'] ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    const error = new Error('missing or invalid idempotency key');
    error.statusCode = 400;
    throw error;
  }
  return key;
}

function featureEnabled(reply, enabled, feature) {
  if (enabled) return true;
  reply.code(503).send({
    error: 'feature_unavailable',
    message: 'این قابلیت هنوز فعال نشده است.',
    feature
  });
  return false;
}

function callbackUrl() {
  return `${config.paymentCallbackBaseUrl}/v1/payments/zarinpal/callback`;
}

function issueAccessToken(user) {
  const expiresInSeconds = 60 * 60;
  return {
    expiresInSeconds,
    accessToken: jwt.sign({ sub: user.id, role: user.role, phone: user.phone_e164 }, config.jwtSecret, {
      algorithm: 'HS256', expiresIn: expiresInSeconds, issuer: 'oosta-auth-api', audience: 'oosta-android'
    })
  };
}

function parseAmountTomans(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 10_000 || amount > 1_000_000_000) {
    const error = new Error('invalid payment amount');
    error.statusCode = 400;
    throw error;
  }
  return amount;
}

function safeDescription(value) {
  const description = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (description.length < 3 || description.length > 250) {
    const error = new Error('invalid payment description');
    error.statusCode = 400;
    throw error;
  }
  return description;
}

async function requireApprovedTechnician(client, technicianId) {
  if (!technicianId) return null;
  const { rows } = await client.query(
    `SELECT u.id FROM users u
     JOIN technician_profiles p ON p.user_id = u.id
     WHERE u.id = $1 AND u.role = 'technician' AND u.is_active = TRUE AND p.verification_status = 'approved'`,
    [technicianId]
  );
  if (!rows[0]) {
    const error = new Error('technician is not approved');
    error.statusCode = 409;
    throw error;
  }
  return rows[0].id;
}

app.get('/health', async () => {
  await pool.query('SELECT 1');
  return { status: 'ok' };
});

app.get('/v1/public/features', async () => ({ features: publicFeatures(config) }));

app.post('/v1/auth/request-otp', async (request, reply) => {
  const phone = requirePhone(request.body);
  const client = await pool.connect();
  let challengeId;
  let code;
  try {
    await client.query('BEGIN');
    // Transaction-scoped advisory locking makes concurrent sends for one number deterministic.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);
    const { rows: recent } = await client.query(
      `SELECT id, status, sent_at, created_at
       FROM otp_challenges
       WHERE phone_e164 = $1 AND created_at > NOW() - ($2 * INTERVAL '1 minute')
       ORDER BY created_at DESC`,
      [phone, OTP_SEND_WINDOW_MINUTES]
    );
    const newest = recent[0];
    if (newest?.sent_at && (Date.now() - new Date(newest.sent_at).getTime()) < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      await client.query('ROLLBACK');
      return reply.code(429).send({ error: 'resend_too_soon', message: 'لطفاً یک دقیقه برای ارسال دوبارهٔ کد صبر کنید.', retry_after_seconds: OTP_RESEND_COOLDOWN_SECONDS });
    }
    if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
      await client.query('ROLLBACK');
      return reply.code(429).send({ error: 'too_many_requests', message: 'تعداد درخواست کد زیاد است. چند دقیقه دیگر دوباره تلاش کنید.', retry_after_seconds: OTP_SEND_WINDOW_MINUTES * 60 });
    }

    challengeId = crypto.randomUUID();
    code = generateOtp();
    await client.query(
      `INSERT INTO otp_challenges (id, phone_e164, code_hash, status, expires_at)
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
        receptor: `0${phone.slice(3)}`,
        token: code
      });
    }
    await pool.query(`UPDATE otp_challenges SET status = 'pending', sent_at = NOW(), provider_message_id = $2 WHERE id = $1`, [challengeId, providerMessageId]);
  } catch (error) {
    await pool.query(`UPDATE otp_challenges SET status = 'failed', failure_reason = $2 WHERE id = $1`, [challengeId, String(error.message).slice(0, 500)]);
    request.log.error({ err: error, phone }, 'OTP provider delivery failed');
    return reply.code(502).send({ error: 'sms_unavailable', message: 'ارسال پیامک موقتاً ممکن نیست. لطفاً چند دقیقه دیگر دوباره تلاش کنید.' });
  }

  return reply.code(202).send({ message: 'اگر شماره معتبر باشد، کد تأیید ارسال می‌شود.', expires_in_seconds: OTP_EXPIRY_MINUTES * 60, resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS });
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
      `SELECT * FROM otp_challenges WHERE phone_e164 = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [phone]
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
      await client.query(`INSERT INTO users (id, phone_e164, role, last_login_at) VALUES ($1, $2, $3, NOW())`, [user.id, user.phone_e164, user.role]);
    }
    await audit(client, { actorUserId: user.id, action: 'auth.verified', subjectType: 'user', subjectId: user.id });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const session = issueAccessToken(user);
  return reply.send({ access_token: session.accessToken, token_type: 'Bearer', expires_in_seconds: session.expiresInSeconds, user: { id: user.id, phone: user.phone_e164, role: user.role } });
});

app.get('/v1/me', async (request, reply) => {
  const claims = authenticatedUser(request, config);
  if (!claims) return reply.code(401).send({ error: 'unauthorized', message: 'ورود لازم است.' });
  const { rows } = await pool.query(`SELECT id, phone_e164, role, is_active FROM users WHERE id = $1`, [claims.sub]);
  const user = rows[0];
  if (!user?.is_active) return reply.code(401).send({ error: 'unauthorized', message: 'حساب کاربری فعال نیست.' });
  return { user: { id: user.id, phone: user.phone_e164, role: user.role } };
});

app.post('/v1/ai/diagnoses', async (request, reply) => {
  const user = requireUser(request, reply, config);
  if (!user || !featureEnabled(reply, config.aiEnabled, 'ai_diagnosis')) return;
  const category = String(request.body?.category ?? '').trim();
  const symptom = String(request.body?.symptom ?? '').trim();
  if (!category || symptom.length < 3 || symptom.length > 2_000) return reply.code(400).send({ error: 'invalid_request', message: 'شرح مشکل معتبر نیست.' });
  try {
    const result = await generateDiagnosis({ config, category, symptom, images: request.body?.images });
    const client = await pool.connect();
    try {
      await audit(client, { actorUserId: user.sub, action: 'ai.diagnosis_requested', subjectType: 'ai_request', subjectId: result.requestId, metadata: { category } });
    } finally {
      client.release();
    }
    return { result: result.text, request_id: result.requestId, preliminary: true };
  } catch (error) {
    request.log.warn({ err: error, userId: user.sub }, 'AI diagnosis unavailable');
    const message = error instanceof AiUnavailableError ? 'تشخیص هوشمند موقتاً در دسترس نیست. برای بررسی ایمن با پشتیبانی تماس بگیرید.' : 'ثبت تشخیص موقتاً ممکن نیست.';
    return reply.code(503).send({ error: 'ai_unavailable', message });
  }
});

app.post('/v1/technicians/apply', async (request, reply) => {
  const user = requireUser(request, reply, config, ['customer']);
  if (!user) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET role = 'technician' WHERE id = $1`, [user.sub]);
    await client.query(
      `INSERT INTO technician_profiles (user_id, verification_status, updated_at)
       VALUES ($1, 'unsubmitted', NOW())
       ON CONFLICT (user_id) DO NOTHING`, [user.sub]
    );
    await audit(client, { actorUserId: user.sub, action: 'technician.applied', subjectType: 'user', subjectId: user.sub });
    const issuedUser = { id: user.sub, role: 'technician', phone_e164: user.phone };
    const session = issueAccessToken(issuedUser);
    await client.query('COMMIT');
    return reply.code(202).send({
      status: 'unsubmitted',
      access_token: session.accessToken,
      expires_in_seconds: session.expiresInSeconds,
      message: 'درخواست تکنسینی ایجاد شد؛ ارسال مدارک و بررسی انسانی لازم است.'
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/technicians/kyc', async (request, reply) => {
  const user = requireUser(request, reply, config, ['technician']);
  if (!user) return;
  const documentReference = String(request.body?.document_reference ?? '').trim();
  const documentHash = String(request.body?.document_hash ?? '').trim().toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(documentHash) || documentReference.length < 8 || documentReference.length > 500) {
    return reply.code(400).send({ error: 'invalid_request', message: 'اطلاعات مدرک معتبر نیست.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT verification_status FROM technician_profiles WHERE user_id = $1 FOR UPDATE`, [user.sub]);
    if (existing.rows[0]?.verification_status === 'suspended') {
      await client.query('ROLLBACK');
      return reply.code(403).send({ error: 'suspended', message: 'حساب تکنسین تعلیق شده است.' });
    }
    const caseId = crypto.randomUUID();
    await client.query(
      `INSERT INTO kyc_cases (id, technician_id, status, document_reference, document_hash)
       VALUES ($1, $2, 'submitted', $3, $4)`, [caseId, user.sub, documentReference, documentHash.slice('sha256:'.length)]
    );
    await client.query(
      `INSERT INTO technician_profiles (user_id, verification_status, updated_at)
       VALUES ($1, 'submitted', NOW())
       ON CONFLICT (user_id) DO UPDATE SET verification_status = 'submitted', updated_at = NOW()`, [user.sub]
    );
    await audit(client, { actorUserId: user.sub, action: 'kyc.submitted', subjectType: 'kyc_case', subjectId: caseId });
    await client.query('COMMIT');
    return reply.code(201).send({ id: caseId, status: 'submitted', message: 'مدارک برای بررسی انسانی ثبت شد.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/admin/kyc/:caseId/decision', async (request, reply) => {
  const admin = requireUser(request, reply, config, ['operator', 'admin']);
  if (!admin) return;
  const status = String(request.body?.status ?? '');
  const reason = String(request.body?.reason ?? '').trim().slice(0, 1_000);
  if (!['approved', 'rejected', 'suspended'].includes(status) || reason.length < 3) return reply.code(400).send({ error: 'invalid_request', message: 'تصمیم بررسی معتبر نیست.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM kyc_cases WHERE id = $1 FOR UPDATE`, [request.params.caseId]);
    const kycCase = rows[0];
    if (!kycCase) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'not_found', message: 'پرونده یافت نشد.' });
    }
    await client.query(`UPDATE kyc_cases SET status = $2, reviewed_at = NOW(), reviewed_by = $3, decision_reason = $4 WHERE id = $1`, [kycCase.id, status, admin.sub, reason]);
    await client.query(
      `INSERT INTO technician_profiles (user_id, verification_status, suspension_reason, reviewed_by, reviewed_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET verification_status = $2, suspension_reason = $3, reviewed_by = $4, reviewed_at = NOW(), updated_at = NOW()`,
      [kycCase.technician_id, status, status === 'suspended' ? reason : null, admin.sub]
    );
    await audit(client, { actorUserId: admin.sub, action: `kyc.${status}`, subjectType: 'kyc_case', subjectId: kycCase.id, metadata: { reason } });
    await client.query('COMMIT');
    return { id: kycCase.id, status };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/orders', async (request, reply) => {
  const user = requireUser(request, reply, config);
  if (!user || !featureEnabled(reply, config.newBookingsEnabled, 'new_bookings')) return;
  const category = String(request.body?.category ?? '').trim();
  const problemDescription = String(request.body?.problem_description ?? '').replace(/\s+/g, ' ').trim();
  if (category.length < 2 || category.length > 80 || problemDescription.length < 3 || problemDescription.length > 2_000) {
    return reply.code(400).send({ error: 'invalid_request', message: 'اطلاعات درخواست معتبر نیست.' });
  }
  const orderId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO service_orders (id, customer_id, category, problem_description, status)
     VALUES ($1, $2, $3, $4, 'submitted')`, [orderId, user.sub, category, problemDescription]
  );
  const client = await pool.connect();
  try {
    await audit(client, { actorUserId: user.sub, action: 'order.submitted', subjectType: 'order', subjectId: orderId });
  } finally {
    client.release();
  }
  return reply.code(201).send({ id: orderId, status: 'submitted' });
});

app.post('/v1/orders/:orderId/quotes', async (request, reply) => {
  const technician = requireUser(request, reply, config, ['technician']);
  if (!technician || !featureEnabled(reply, config.technicianMatchingEnabled, 'technician_matching')) return;
  const laborTomans = Number(request.body?.labor_tomans);
  const partsTomans = Number(request.body?.parts_tomans);
  const warrantyDays = Number(request.body?.warranty_days);
  const lineItems = request.body?.line_items;
  const totalTomans = laborTomans + partsTomans;
  if (!Number.isSafeInteger(laborTomans) || laborTomans < 0 || !Number.isSafeInteger(partsTomans) || partsTomans < 0 ||
      !Number.isSafeInteger(totalTomans) || totalTomans < 10_000 || !Number.isInteger(warrantyDays) || warrantyDays < 0 || warrantyDays > 365 ||
      !Array.isArray(lineItems) || lineItems.length === 0 || lineItems.length > 20) {
    return reply.code(400).send({ error: 'invalid_request', message: 'پیش‌فاکتور معتبر نیست.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM service_orders WHERE id = $1 FOR UPDATE`, [request.params.orderId]);
    const order = orderResult.rows[0];
    if (!order || !['submitted', 'quoted'].includes(order.status)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_order_state', message: 'امکان ثبت پیش‌فاکتور برای این سفارش وجود ندارد.' });
    }
    await requireApprovedTechnician(client, technician.sub);
    const revisionResult = await client.query(`SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM quotes WHERE order_id = $1`, [order.id]);
    const quoteId = crypto.randomUUID();
    await client.query(
      `INSERT INTO quotes (id, order_id, technician_id, revision, status, labor_tomans, parts_tomans, total_tomans, warranty_days, line_items)
       VALUES ($1, $2, $3, $4, 'sent', $5, $6, $7, $8, $9::jsonb)`,
      [quoteId, order.id, technician.sub, Number(revisionResult.rows[0].revision), laborTomans, partsTomans, totalTomans, warrantyDays, JSON.stringify(lineItems)]
    );
    await client.query(`UPDATE service_orders SET status = 'quoted', updated_at = NOW() WHERE id = $1`, [order.id]);
    await audit(client, { actorUserId: technician.sub, action: 'quote.sent', subjectType: 'quote', subjectId: quoteId, metadata: { orderId: order.id } });
    await client.query('COMMIT');
    return reply.code(201).send({ id: quoteId, status: 'sent', total_tomans: totalTomans });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/quotes/:quoteId/accept', async (request, reply) => {
  const customer = requireUser(request, reply, config, ['customer']);
  if (!customer || !featureEnabled(reply, config.newBookingsEnabled, 'new_bookings')) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT q.*, o.customer_id, o.status AS order_status FROM quotes q
       JOIN service_orders o ON o.id = q.order_id
       WHERE q.id = $1 FOR UPDATE`, [request.params.quoteId]
    );
    const quote = result.rows[0];
    if (!quote || quote.customer_id !== customer.sub || quote.status !== 'sent') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'quote_unavailable', message: 'این پیش‌فاکتور قابل تأیید نیست.' });
    }
    await client.query(`UPDATE quotes SET status = 'superseded' WHERE order_id = $1 AND status = 'sent' AND id <> $2`, [quote.order_id, quote.id]);
    await client.query(`UPDATE quotes SET status = 'accepted' WHERE id = $1`, [quote.id]);
    await client.query(`UPDATE service_orders SET status = 'awaiting_payment', updated_at = NOW() WHERE id = $1`, [quote.order_id]);
    await client.query(`INSERT INTO quote_acceptances (id, quote_id, customer_id, acceptance_ip) VALUES ($1, $2, $3, $4)`, [crypto.randomUUID(), quote.id, customer.sub, request.ip]);
    await audit(client, { actorUserId: customer.sub, action: 'quote.accepted', subjectType: 'quote', subjectId: quote.id });
    await client.query('COMMIT');
    return { id: quote.id, status: 'accepted', total_tomans: Number(quote.total_tomans) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/orders/:orderId/evidence', async (request, reply) => {
  const technician = requireUser(request, reply, config, ['technician']);
  if (!technician) return;
  const phase = String(request.body?.phase ?? '');
  const objectReference = String(request.body?.object_reference ?? '').trim();
  const objectHash = String(request.body?.object_hash ?? '').trim().toLowerCase();
  if (!['before', 'after'].includes(phase) || objectReference.length < 8 || objectReference.length > 500 || !/^sha256:[a-f0-9]{64}$/.test(objectHash)) {
    return reply.code(400).send({ error: 'invalid_request', message: 'مدرک کار معتبر نیست.' });
  }
  const { rows } = await pool.query(
    `SELECT q.id FROM quotes q WHERE q.order_id = $1 AND q.technician_id = $2 AND q.status IN ('accepted', 'paid') LIMIT 1`,
    [request.params.orderId, technician.sub]
  );
  if (!rows[0]) return reply.code(403).send({ error: 'forbidden', message: 'این سفارش به شما واگذار نشده است.' });
  const evidenceId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO job_evidence (id, order_id, technician_id, phase, object_reference, object_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`, [evidenceId, request.params.orderId, technician.sub, phase, objectReference, objectHash.slice('sha256:'.length)]
  );
  return reply.code(201).send({ id: evidenceId, phase });
});

app.post('/v1/payments/zarinpal/start', async (request, reply) => {
  const user = requireUser(request, reply, config, ['customer']);
  if (!user || !featureEnabled(reply, config.paymentsEnabled, 'payments')) return;
  const idempotencyKey = requireIdempotencyKey(request);
  const quoteId = String(request.body?.quote_id ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return reply.code(400).send({ error: 'invalid_request', message: 'پیش‌فاکتور معتبر نیست.' });
  const client = await pool.connect();
  let intent;
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT * FROM payment_intents WHERE idempotency_key = $1 FOR UPDATE`, [idempotencyKey]);
    if (existing.rows[0]) {
      intent = existing.rows[0];
      await client.query('COMMIT');
      if (intent.status === 'pending' && intent.authority) {
        return { id: intent.id, status: intent.status, checkout_url: `${config.zarinpalSandbox ? 'https://sandbox.zarinpal.com' : 'https://www.zarinpal.com'}/pg/StartPay/${intent.authority}` };
      }
      return reply.code(409).send({ error: 'idempotency_conflict', message: 'این درخواست قبلاً پردازش شده است.', status: intent.status });
    }
    const result = await client.query(
      `SELECT q.*, o.customer_id, o.status AS order_status FROM quotes q
       JOIN service_orders o ON o.id = q.order_id
       JOIN quote_acceptances a ON a.quote_id = q.id
       WHERE q.id = $1 FOR UPDATE`, [quoteId]
    );
    const quote = result.rows[0];
    if (!quote || quote.customer_id !== user.sub || quote.status !== 'accepted' || quote.order_status !== 'awaiting_payment') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'quote_unavailable', message: 'این پیش‌فاکتور آمادهٔ پرداخت نیست.' });
    }
    await requireApprovedTechnician(client, quote.technician_id);
    const amountTomans = Number(quote.total_tomans);
    const description = `پرداخت پیش‌فاکتور ${quote.id}`;
    intent = { id: crypto.randomUUID(), customerId: user.sub, amountTomans, description, technicianId: quote.technician_id, quoteId: quote.id };
    await client.query(
      `INSERT INTO payment_intents (id, customer_id, technician_id, quote_id, provider, amount_tomans, amount_rials, description, idempotency_key, status)
       VALUES ($1, $2, $3, $4, 'zarinpal', $5, $6, $7, $8, 'created')`,
      [intent.id, intent.customerId, intent.technicianId, intent.quoteId, amountTomans, amountTomans * 10, description, idempotencyKey]
    );
    await audit(client, { actorUserId: user.sub, action: 'payment.created', subjectType: 'payment_intent', subjectId: intent.id, metadata: { quoteId } });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  try {
    const payment = await createZarinpalPayment({
      merchantId: config.zarinpalMerchantId,
      amountRials: intent.amountTomans * 10,
      callbackUrl: callbackUrl(),
      description: intent.description,
      metadata: { mobile: user.phone?.replace(/^\+98/, '0') },
      sandbox: config.zarinpalSandbox
    });
    await pool.query(`UPDATE payment_intents SET authority = $2, status = 'pending' WHERE id = $1`, [intent.id, payment.authority]);
    return reply.code(201).send({ id: intent.id, status: 'pending', checkout_url: payment.paymentUrl });
  } catch (error) {
    await pool.query(`UPDATE payment_intents SET status = 'failed' WHERE id = $1`, [intent.id]);
    request.log.error({ err: error, paymentIntentId: intent.id }, 'Unable to create Zarinpal payment');
    return reply.code(502).send({ error: 'payment_unavailable', message: 'ایجاد پرداخت موقتاً ممکن نیست.' });
  }
});

app.get('/v1/payments/zarinpal/callback', async (request, reply) => {
  const authority = String(request.query?.Authority ?? '').trim();
  const status = String(request.query?.Status ?? '').trim();
  if (!/^[A-Za-z0-9-]{10,128}$/.test(authority)) return reply.code(400).type('text/plain').send('Invalid payment callback.');
  const { rows } = await pool.query(`SELECT * FROM payment_intents WHERE authority = $1`, [authority]);
  const intent = rows[0];
  if (!intent || status !== 'OK') return reply.code(400).type('text/plain').send('Payment was cancelled or could not be matched.');
  try {
    const verification = await verifyZarinpalPayment({ merchantId: config.zarinpalMerchantId, amountRials: Number(intent.amount_rials), authority, sandbox: config.zarinpalSandbox });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE`, [intent.id]);
      const paymentIntent = locked.rows[0];
      if (paymentIntent.status !== 'paid') {
        const amount = Number(paymentIntent.amount_tomans);
        const escrow = Math.floor(amount * 0.15);
        const technicianPayable = amount - escrow;
        await postLedgerEntry(client, {
          idempotencyKey: `payment-capture:${paymentIntent.id}`,
          eventType: 'payment_capture',
          paymentIntentId: paymentIntent.id,
          metadata: { provider: 'zarinpal', providerRefId: verification.refId },
          postings: [
            { account: 'gateway_clearing', direction: 'debit', amountTomans: amount },
            { account: 'technician_payable', direction: 'credit', amountTomans: technicianPayable },
            { account: 'escrow_liability', direction: 'credit', amountTomans: escrow }
          ]
        });
        await client.query(`UPDATE payment_intents SET status = 'paid', provider_ref_id = $2, paid_at = NOW() WHERE id = $1`, [paymentIntent.id, verification.refId]);
        await client.query(`UPDATE quotes SET status = 'paid' WHERE id = $1`, [paymentIntent.quote_id]);
        await client.query(`UPDATE service_orders SET status = 'paid', updated_at = NOW() WHERE id = (SELECT order_id FROM quotes WHERE id = $1)`, [paymentIntent.quote_id]);
        await client.query(
          `INSERT INTO escrow_holds (id, payment_intent_id, customer_id, technician_id, amount_tomans, release_after, status)
           VALUES ($1, $2, $3, $4, $5, NOW() + ($6 * INTERVAL '1 day'), 'held')`,
          [crypto.randomUUID(), paymentIntent.id, paymentIntent.customer_id, paymentIntent.technician_id, escrow, DEFAULT_ESCROW_DAYS]
        );
        await audit(client, { actorUserId: paymentIntent.customer_id, action: 'payment.verified', subjectType: 'payment_intent', subjectId: paymentIntent.id, metadata: { providerRefId: verification.refId } });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return reply.type('text/html; charset=utf-8').send('<!doctype html><title>پرداخت اوستا</title><p dir="rtl">پرداخت با موفقیت ثبت شد. می‌توانید به برنامهٔ اوستا بازگردید.</p>');
  } catch (error) {
    request.log.error({ err: error, authority }, 'Zarinpal verification failed');
    return reply.code(502).type('text/plain').send('Payment verification failed. Please contact support with your payment authority.');
  }
});

app.post('/v1/admin/escrows/release-due', async (request, reply) => {
  const operator = requireUser(request, reply, config, ['operator', 'admin']);
  if (!operator || !featureEnabled(reply, config.escrowReleaseEnabled, 'escrow_release')) return;
  const client = await pool.connect();
  let released = 0;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT h.* FROM escrow_holds h
       WHERE h.status = 'held' AND h.release_after <= NOW()
       ORDER BY h.release_after ASC FOR UPDATE SKIP LOCKED LIMIT 100`
    );
    for (const hold of rows) {
      // A hold without a technician assignment remains held for manual reconciliation.
      if (!hold.technician_id) continue;
      const entry = await postLedgerEntry(client, {
        idempotencyKey: `escrow-release:${hold.id}`,
        eventType: 'escrow_release',
        paymentIntentId: hold.payment_intent_id,
        metadata: { escrowHoldId: hold.id },
        postings: [
          { account: 'escrow_liability', direction: 'debit', amountTomans: Number(hold.amount_tomans) },
          { account: 'technician_payable', direction: 'credit', amountTomans: Number(hold.amount_tomans) }
        ]
      });
      if (!entry.duplicate) {
        await client.query(`UPDATE escrow_holds SET status = 'released', released_at = NOW() WHERE id = $1`, [hold.id]);
        await audit(client, { actorUserId: operator.sub, action: 'escrow.released', subjectType: 'escrow_hold', subjectId: hold.id });
        released += 1;
      }
    }
    await client.query('COMMIT');
    return { released };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

async function closeGracefully(signal) {
  app.log.info({ signal }, 'Stopping Oosta platform API');
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
