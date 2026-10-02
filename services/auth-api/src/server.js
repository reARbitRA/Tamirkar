import crypto from 'node:crypto';
import Fastify from 'fastify';
import pg from 'pg';
import { generateDiagnosis, AiUnavailableError } from './ai.js';
import { authenticatedUser, requireActiveUser, requireUser } from './auth.js';
import { loadConfig } from './config.js';
import { publicFeatures } from './feature-flags.js';
import { sendKavenegarOtp } from './kavenegar.js';
import { audit, postLedgerEntry } from './ledger.js';
import { issueAccessToken } from './session.js';
import { latinDigits, normalizeIranMobile } from './phone.js';
import { generateOtp, hashOtp, otpMatches } from './otp.js';
import { createZarinpalPayment, verifyZarinpalPayment } from './zarinpal.js';

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_SENDS_PER_WINDOW = 3;
const OTP_SEND_WINDOW_MINUTES = 15;
const DEFAULT_ESCROW_DAYS = 30;
// Two accepted 2 MiB binary images become about 5.34 MiB after base64 encoding plus JSON.
// The AI module still validates each image and caps the count before it reaches a provider.
const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024;

const config = loadConfig();
// Bounded on purpose: without these a single hung query pins a request forever and, at
// max:10, ten of them exhaust the pool and take the whole service down.
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  options: '-c statement_timeout=15000'
});
// Render terminates TLS and forwards to this container. Without trustProxy, request.ip is the
// proxy's address, which would make quote_acceptances.acceptance_ip useless as dispute evidence.
const app = Fastify({ logger: true, bodyLimit: MAX_REQUEST_BODY_BYTES, trustProxy: 1 });

// --- Minimal in-process metrics. Counters are plain integers exposed at GET /metrics. ---
const metrics = {
  requests: new Map(),      // "route|status_class" -> count
  providerFailures: new Map(), // provider -> count
  startedAt: Date.now()
};
function bumpRequest(route, status) {
  const key = `${route}|${Math.floor(status / 100)}xx`;
  metrics.requests.set(key, (metrics.requests.get(key) ?? 0) + 1);
}
function bumpProviderFailure(provider) {
  metrics.providerFailures.set(provider, (metrics.providerFailures.get(provider) ?? 0) + 1);
}

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

app.addHook('onResponse', async (request, reply) => {
  bumpRequest(request.routeOptions?.url ?? request.url, reply.statusCode);
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Malformed identifiers are a client error, not a server fault: pg would otherwise throw 22P02 and surface a 500. */
function requireUuid(value, reply) {
  if (!UUID_PATTERN.test(String(value ?? ''))) {
    reply.code(400).send({ error: 'invalid_request', message: 'شناسهٔ درخواست معتبر نیست.' });
    return null;
  }
  return String(value);
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

function issueSession(user) {
  return issueAccessToken({ userId: user.id, role: user.role, jwtSecret: config.jwtSecret });
}

function phoneLogReference(phone) {
  return crypto.createHmac('sha256', config.otpPepper).update(phone).digest('hex').slice(0, 16);
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

app.get('/metrics', async (request, reply) => {
  const lines = [
    '# TYPE oosta_process_uptime_seconds gauge',
    `oosta_process_uptime_seconds ${Math.round((Date.now() - metrics.startedAt) / 1000)}`,
    '# TYPE oosta_pool_waiting gauge',
    `oosta_pool_waiting ${pool.waitingCount}`,
    '# TYPE oosta_pool_idle gauge',
    `oosta_pool_idle ${pool.idleCount}`,
    '# TYPE oosta_pool_total gauge',
    `oosta_pool_total ${pool.totalCount}`,
    '# TYPE oosta_http_requests_total counter'
  ];
  for (const [key, value] of metrics.requests) {
    const [route, statusClass] = key.split('|');
    lines.push(`oosta_http_requests_total{route="${route}",status_class="${statusClass}"} ${value}`);
  }
  lines.push('# TYPE oosta_provider_failures_total counter');
  for (const [provider, value] of metrics.providerFailures) {
    lines.push(`oosta_provider_failures_total{provider="${provider}"} ${value}`);
  }
  const due = await pool.query(
    `SELECT COUNT(*)::int AS n FROM escrow_holds WHERE status = 'held' AND release_after <= NOW()`
  ).catch(() => ({ rows: [{ n: -1 }] }));
  lines.push('# TYPE oosta_escrow_holds_due gauge');
  lines.push(`oosta_escrow_holds_due ${due.rows[0].n}`);
  return reply.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
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
      request.log.warn({ phoneRef: phoneLogReference(phone), code }, 'OTP development mode — code is deliberately logged only locally');
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
    bumpProviderFailure('kavenegar');
    request.log.error({ err: error, phoneRef: phoneLogReference(phone) }, 'OTP provider delivery failed');
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

  const session = issueSession(user);
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

// Server-backed order history. Without these the device passport dies with the install,
// which contradicts the durability the product promises.
app.get('/v1/orders', async (request, reply) => {
  const user = await requireActiveUser(request, reply, config, pool);
  if (!user) return;
  const limit = Math.min(Math.max(Number.parseInt(String(request.query?.limit ?? 50), 10) || 50, 1), 100);
  const offset = Math.max(Number.parseInt(String(request.query?.offset ?? 0), 10) || 0, 0);
  const scope = ['operator', 'admin'].includes(user.role);
  const params = scope ? [limit, offset] : [user.sub, limit, offset];
  const { rows } = await pool.query(
    `SELECT o.id, o.category, o.problem_description, o.status, o.created_at, o.updated_at,
            q.id AS quote_id, q.total_tomans, q.status AS quote_status, q.warranty_days
     FROM service_orders o
     LEFT JOIN LATERAL (
       SELECT * FROM quotes WHERE order_id = o.id
       ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END, created_at DESC
       LIMIT 1
     ) q ON TRUE
     ${scope ? '' : 'WHERE o.customer_id = $1'}
     ORDER BY o.created_at DESC
     LIMIT $${scope ? 1 : 2} OFFSET $${scope ? 2 : 3}`,
    params
  );
  return { orders: rows, limit, offset };
});

app.get('/v1/orders/:orderId', async (request, reply) => {
  const user = await requireActiveUser(request, reply, config, pool);
  if (!user) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
  const { rows } = await pool.query(
    `SELECT o.*,
            COALESCE(json_agg(DISTINCT jsonb_build_object(
              'id', q.id, 'revision', q.revision, 'status', q.status, 'technician_id', q.technician_id,
              'labor_tomans', q.labor_tomans, 'parts_tomans', q.parts_tomans, 'total_tomans', q.total_tomans,
              'warranty_days', q.warranty_days, 'line_items', q.line_items, 'created_at', q.created_at
            )) FILTER (WHERE q.id IS NOT NULL), '[]') AS quotes,
            COALESCE(json_agg(DISTINCT jsonb_build_object(
              'id', e.id, 'phase', e.phase, 'object_reference', e.object_reference,
              'object_hash', e.object_hash, 'created_at', e.created_at
            )) FILTER (WHERE e.id IS NOT NULL), '[]') AS evidence
     FROM service_orders o
     LEFT JOIN quotes q ON q.order_id = o.id
     LEFT JOIN job_evidence e ON e.order_id = o.id
     WHERE o.id = $1
     GROUP BY o.id`, [orderId]);
  const order = rows[0];
  if (!order) return reply.code(404).send({ error: 'not_found', message: 'سفارش یافت نشد.' });
  const privileged = ['operator', 'admin'].includes(user.role);
  const isOwner = order.customer_id === user.sub;
  const isTechnician = order.quotes.some((q) => q.technician_id === user.sub);
  if (!privileged && !isOwner && !isTechnician) {
    return reply.code(404).send({ error: 'not_found', message: 'سفارش یافت نشد.' });
  }
  const holds = await pool.query(
    `SELECT h.id, h.amount_tomans, h.status, h.release_after, h.released_at
     FROM escrow_holds h JOIN payment_intents p ON p.id = h.payment_intent_id
     JOIN quotes q ON q.id = p.quote_id WHERE q.order_id = $1`, [orderId]);
  return { order: { ...order, escrow_holds: holds.rows } };
});

app.post('/v1/ai/diagnoses', async (request, reply) => {
  const user = await requireActiveUser(request, reply, config, pool);
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
    bumpProviderFailure('gemini');
    request.log.warn({ err: error, userId: user.sub }, 'AI diagnosis unavailable');
    const message = error instanceof AiUnavailableError ? 'تشخیص هوشمند موقتاً در دسترس نیست. برای بررسی ایمن با پشتیبانی تماس بگیرید.' : 'ثبت تشخیص موقتاً ممکن نیست.';
    return reply.code(503).send({ error: 'ai_unavailable', message });
  }
});

app.post('/v1/technicians/apply', async (request, reply) => {
  const user = await requireActiveUser(request, reply, config, pool, ['customer']);
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
    const session = issueSession({ id: user.sub, role: 'technician' });
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
  const user = await requireActiveUser(request, reply, config, pool, ['technician']);
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
  const admin = await requireActiveUser(request, reply, config, pool, ['operator', 'admin']);
  if (!admin) return;
  const caseId = requireUuid(request.params.caseId, reply);
  if (!caseId) return;
  const status = String(request.body?.status ?? '');
  const reason = String(request.body?.reason ?? '').trim().slice(0, 1_000);
  if (!['approved', 'rejected', 'suspended'].includes(status) || reason.length < 3) return reply.code(400).send({ error: 'invalid_request', message: 'تصمیم بررسی معتبر نیست.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM kyc_cases WHERE id = $1 FOR UPDATE`, [caseId]);
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
  const user = await requireActiveUser(request, reply, config, pool, ['customer']);
  if (!user || !featureEnabled(reply, config.newBookingsEnabled, 'new_bookings')) return;
  const category = String(request.body?.category ?? '').trim();
  const problemDescription = String(request.body?.problem_description ?? '').replace(/\s+/g, ' ').trim();
  if (category.length < 2 || category.length > 80 || problemDescription.length < 3 || problemDescription.length > 2_000) {
    return reply.code(400).send({ error: 'invalid_request', message: 'اطلاعات درخواست معتبر نیست.' });
  }
  const orderId = crypto.randomUUID();
  const client = await pool.connect();
  try {
    // One transaction: an order and its audit row either both exist or neither does.
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO service_orders (id, customer_id, category, problem_description, status)
       VALUES ($1, $2, $3, $4, 'submitted')`, [orderId, user.sub, category, problemDescription]
    );
    await audit(client, { actorUserId: user.sub, action: 'order.submitted', subjectType: 'order', subjectId: orderId });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return reply.code(201).send({ id: orderId, status: 'submitted' });
});

app.post('/v1/orders/:orderId/quotes', async (request, reply) => {
  const technician = await requireActiveUser(request, reply, config, pool, ['technician']);
  if (!technician || !featureEnabled(reply, config.technicianMatchingEnabled, 'technician_matching')) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
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
    const orderResult = await client.query(`SELECT * FROM service_orders WHERE id = $1 FOR UPDATE`, [orderId]);
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
  const customer = await requireActiveUser(request, reply, config, pool, ['customer']);
  if (!customer || !featureEnabled(reply, config.newBookingsEnabled, 'new_bookings')) return;
  const quoteId = requireUuid(request.params.quoteId, reply);
  if (!quoteId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT q.*, o.customer_id, o.status AS order_status FROM quotes q
       JOIN service_orders o ON o.id = q.order_id
       WHERE q.id = $1 FOR UPDATE`, [quoteId]
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
  const technician = await requireActiveUser(request, reply, config, pool, ['technician']);
  if (!technician) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
  const phase = String(request.body?.phase ?? '');
  const objectReference = String(request.body?.object_reference ?? '').trim();
  const objectHash = String(request.body?.object_hash ?? '').trim().toLowerCase();
  if (!['before', 'after'].includes(phase) || objectReference.length < 8 || objectReference.length > 500 || !/^sha256:[a-f0-9]{64}$/.test(objectHash)) {
    return reply.code(400).send({ error: 'invalid_request', message: 'مدرک کار معتبر نیست.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT status FROM service_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = orderResult.rows[0];
    // Evidence is proof that work happened. It cannot be attached to an order that has not been
    // paid for, and it cannot be attached after the order has been cancelled or disputed.
    if (!order || !['paid', 'in_progress'].includes(order.status)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_order_state', message: 'امکان ثبت مدرک در این وضعیت سفارش وجود ندارد.' });
    }
    const { rows } = await client.query(
      `SELECT q.id FROM quotes q WHERE q.order_id = $1 AND q.technician_id = $2 AND q.status IN ('accepted', 'paid') LIMIT 1`,
      [orderId, technician.sub]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return reply.code(403).send({ error: 'forbidden', message: 'این سفارش به شما واگذار نشده است.' });
    }
    // Approval is re-checked at write time: a technician suspended after acceptance must not
    // keep adding to the record.
    await requireApprovedTechnician(client, technician.sub);
    const evidenceId = crypto.randomUUID();
    await client.query(
      `INSERT INTO job_evidence (id, order_id, technician_id, phase, object_reference, object_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`, [evidenceId, orderId, technician.sub, phase, objectReference, objectHash.slice('sha256:'.length)]
    );
    await audit(client, { actorUserId: technician.sub, action: `evidence.${phase}`, subjectType: 'order', subjectId: orderId });
    await client.query('COMMIT');
    return reply.code(201).send({ id: evidenceId, phase });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

// ---- Order lifecycle. Without these transitions escrow released to technicians for work
// that may never have happened, and no dispute could ever be recorded. ----

/** Loads the order and the caller's accepted/paid quote for it, under a row lock. */
async function lockOrderForTechnician(client, orderId, technicianId) {
  const orderResult = await client.query(`SELECT * FROM service_orders WHERE id = $1 FOR UPDATE`, [orderId]);
  const order = orderResult.rows[0];
  if (!order) return { error: { code: 404, body: { error: 'not_found', message: 'سفارش یافت نشد.' } } };
  const quoteResult = await client.query(
    `SELECT id FROM quotes WHERE order_id = $1 AND technician_id = $2 AND status IN ('accepted', 'paid') LIMIT 1`,
    [orderId, technicianId]
  );
  if (!quoteResult.rows[0]) return { error: { code: 403, body: { error: 'forbidden', message: 'این سفارش به شما واگذار نشده است.' } } };
  return { order, quoteId: quoteResult.rows[0].id };
}

app.post('/v1/orders/:orderId/start', async (request, reply) => {
  const technician = await requireActiveUser(request, reply, config, pool, ['technician']);
  if (!technician) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await lockOrderForTechnician(client, orderId, technician.sub);
    if (locked.error) { await client.query('ROLLBACK'); return reply.code(locked.error.code).send(locked.error.body); }
    if (locked.order.status !== 'paid') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_order_state', message: 'فقط سفارش پرداخت‌شده قابل شروع است.' });
    }
    await client.query(`UPDATE service_orders SET status = 'in_progress', updated_at = NOW() WHERE id = $1`, [orderId]);
    await audit(client, { actorUserId: technician.sub, action: 'order.started', subjectType: 'order', subjectId: orderId });
    await client.query('COMMIT');
    return { id: orderId, status: 'in_progress' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/orders/:orderId/complete', async (request, reply) => {
  const technician = await requireActiveUser(request, reply, config, pool, ['technician']);
  if (!technician) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await lockOrderForTechnician(client, orderId, technician.sub);
    if (locked.error) { await client.query('ROLLBACK'); return reply.code(locked.error.code).send(locked.error.body); }
    if (locked.order.status !== 'in_progress') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_order_state', message: 'فقط سفارش در حال انجام قابل تکمیل است.' });
    }
    // Completion is what unlocks escrow release, so it requires both halves of the visual record.
    const evidence = await client.query(
      `SELECT COUNT(DISTINCT phase)::int AS n FROM job_evidence WHERE order_id = $1 AND technician_id = $2`,
      [orderId, technician.sub]
    );
    if (evidence.rows[0].n < 2) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'evidence_required', message: 'ثبت مدرک قبل و بعد از کار پیش از تکمیل الزامی است.' });
    }
    await client.query(`UPDATE service_orders SET status = 'completed', updated_at = NOW() WHERE id = $1`, [orderId]);
    await audit(client, { actorUserId: technician.sub, action: 'order.completed', subjectType: 'order', subjectId: orderId });
    await client.query('COMMIT');
    return { id: orderId, status: 'completed' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/orders/:orderId/dispute', async (request, reply) => {
  const actor = await requireActiveUser(request, reply, config, pool);
  if (!actor) return;
  const orderId = requireUuid(request.params.orderId, reply);
  if (!orderId) return;
  const reason = String(request.body?.reason ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < 5 || reason.length > 2000) {
    return reply.code(400).send({ error: 'invalid_request', message: 'شرح اختلاف معتبر نیست.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(`SELECT * FROM service_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = orderResult.rows[0];
    if (!order) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found', message: 'سفارش یافت نشد.' }); }
    const privileged = ['operator', 'admin'].includes(actor.role);
    if (!privileged && order.customer_id !== actor.sub) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'not_found', message: 'سفارش یافت نشد.' });
    }
    if (!['paid', 'in_progress', 'completed'].includes(order.status)) {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_order_state', message: 'این سفارش قابل ثبت اختلاف نیست.' });
    }
    await client.query(`UPDATE service_orders SET status = 'disputed', updated_at = NOW() WHERE id = $1`, [orderId]);
    const hold = await client.query(
      `SELECT h.* FROM escrow_holds h JOIN payment_intents p ON p.id = h.payment_intent_id
       JOIN quotes q ON q.id = p.quote_id WHERE q.order_id = $1 AND h.status = 'held' FOR UPDATE OF h`, [orderId]);
    let frozen = 0;
    for (const h of hold.rows) {
      // A dispute claws the technician's 85% back into escrow liability. It is a real, balanced
      // movement: the money is no longer payable until a human resolves the case.
      const technicianShare = Number(h.amount_tomans);
      const capture = await client.query(
        `SELECT p.amount_tomans FROM payment_intents p WHERE p.id = $1`, [h.payment_intent_id]);
      const total = Number(capture.rows[0]?.amount_tomans ?? 0);
      const payable = total - technicianShare;
      if (payable > 0) {
        await postLedgerEntry(client, {
          idempotencyKey: `dispute-freeze:${h.id}`,
          eventType: 'dispute_freeze',
          paymentIntentId: h.payment_intent_id,
          orderReference: orderId,
          metadata: { escrowHoldId: h.id, reason: reason.slice(0, 500) },
          postings: [
            { account: 'technician_payable', direction: 'debit', amountTomans: payable },
            { account: 'escrow_liability', direction: 'credit', amountTomans: payable }
          ]
        });
      }
      await client.query(`UPDATE escrow_holds SET status = 'frozen' WHERE id = $1`, [h.id]);
      frozen += 1;
    }
    await audit(client, { actorUserId: actor.sub, action: 'order.disputed', subjectType: 'order', subjectId: orderId, metadata: { reason: reason.slice(0, 500), holdsFrozen: frozen } });
    await client.query('COMMIT');
    return { id: orderId, status: 'disputed', holds_frozen: frozen };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/admin/escrows/:holdId/refund', async (request, reply) => {
  const operator = await requireActiveUser(request, reply, config, pool, ['operator', 'admin']);
  if (!operator) return;
  const holdId = requireUuid(request.params.holdId, reply);
  if (!holdId) return;
  const reason = String(request.body?.reason ?? '').replace(/\s+/g, ' ').trim();
  if (reason.length < 5 || reason.length > 2000) {
    return reply.code(400).send({ error: 'invalid_request', message: 'دلیل بازپرداخت معتبر نیست.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT * FROM escrow_holds WHERE id = $1 FOR UPDATE`, [holdId]);
    const hold = rows[0];
    if (!hold) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'not_found', message: 'نگه‌داشت وجه یافت نشد.' }); }
    if (hold.status === 'released' || hold.status === 'refunded') {
      await client.query('ROLLBACK');
      return reply.code(409).send({ error: 'invalid_hold_state', message: 'این نگه‌داشت قبلاً تسویه یا بازپرداخت شده است.' });
    }
    const amount = Number(hold.amount_tomans);
    const entry = await postLedgerEntry(client, {
      idempotencyKey: `escrow-refund:${hold.id}`,
      eventType: 'refund',
      paymentIntentId: hold.payment_intent_id,
      metadata: { escrowHoldId: hold.id, reason: reason.slice(0, 500) },
      postings: [
        { account: 'escrow_liability', direction: 'debit', amountTomans: amount },
        { account: 'customer_refund_payable', direction: 'credit', amountTomans: amount }
      ]
    });
    if (!entry.duplicate) {
      await client.query(`UPDATE escrow_holds SET status = 'refunded' WHERE id = $1`, [hold.id]);
      await audit(client, { actorUserId: operator.sub, action: 'escrow.refunded', subjectType: 'escrow_hold', subjectId: hold.id, metadata: { reason: reason.slice(0, 500) } });
    }
    await client.query('COMMIT');
    return { id: hold.id, status: 'refunded', duplicate: entry.duplicate };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

app.post('/v1/payments/zarinpal/start', async (request, reply) => {
  const user = await requireActiveUser(request, reply, config, pool, ['customer']);
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
      `SELECT q.*, o.customer_id, o.status AS order_status, customer.phone_e164 AS customer_phone FROM quotes q
       JOIN service_orders o ON o.id = q.order_id
       JOIN users customer ON customer.id = o.customer_id
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
    intent = {
      id: crypto.randomUUID(),
      customerId: user.sub,
      customerPhone: quote.customer_phone,
      amountTomans,
      description,
      technicianId: quote.technician_id,
      quoteId: quote.id
    };
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
      metadata: { mobile: intent.customerPhone?.replace(/^\+98/, '0') },
      sandbox: config.zarinpalSandbox
    });
    await pool.query(`UPDATE payment_intents SET authority = $2, status = 'pending' WHERE id = $1`, [intent.id, payment.authority]);
    return reply.code(201).send({ id: intent.id, status: 'pending', checkout_url: payment.paymentUrl });
  } catch (error) {
    await pool.query(`UPDATE payment_intents SET status = 'failed' WHERE id = $1`, [intent.id]);
    bumpProviderFailure('zarinpal');
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
  const operator = await requireActiveUser(request, reply, config, pool, ['operator', 'admin']);
  if (!operator || !featureEnabled(reply, config.escrowReleaseEnabled, 'escrow_release')) return;
  const client = await pool.connect();
  let released = 0;
  try {
    await client.query('BEGIN');
    // Escrow is earned by finishing the job, not by the passage of time. A hold on an order that
    // is not 'completed' - disputed, cancelled, or still in progress - must never auto-release.
    const { rows } = await client.query(
      `SELECT h.*, o.status AS order_status FROM escrow_holds h
       JOIN payment_intents p ON p.id = h.payment_intent_id
       JOIN quotes q ON q.id = p.quote_id
       JOIN service_orders o ON o.id = q.order_id
       WHERE h.status = 'held' AND h.release_after <= NOW()
       ORDER BY h.release_after ASC FOR UPDATE SKIP LOCKED LIMIT 100`
    );
    for (const hold of rows) {
      // A hold without a technician assignment remains held for manual reconciliation.
      if (!hold.technician_id) continue;
      // Nor may a hold on an unfinished or contested order.
      if (hold.order_status !== 'completed') continue;
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
