function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('replace-with-') || value.includes('change-this') || value.includes('example.invalid')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name) {
  const value = process.env[name]?.trim() ?? '';
  return value.startsWith('replace-with-') || value.includes('example.invalid') ? '' : value;
}

function enabled(name) {
  return process.env[name] === 'true';
}

const PRODUCTION_LIKE = new Set(['production', 'staging']);

/**
 * OTP_DEV_LOG_CODE writes the plaintext one-time code to the log. It is a local-development
 * affordance only: a single misconfigured variable would otherwise turn every login code into
 * a log line, and anyone with log access could then sign in as any user.
 */
function devLogCode() {
  const requested = process.env.OTP_DEV_LOG_CODE === 'true';
  const env = String(process.env.NODE_ENV ?? '').trim().toLowerCase();
  if (requested && PRODUCTION_LIKE.has(env)) {
    throw new Error('OTP_DEV_LOG_CODE must not be enabled when NODE_ENV is production or staging');
  }
  return requested;
}

function positiveInt(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function loadConfig() {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const paymentsEnabled = enabled('FEATURE_PAYMENTS');
  const zarinpalMerchantId = optional('ZARINPAL_MERCHANT_ID');
  const paymentCallbackBaseUrl = optional('PAYMENT_CALLBACK_BASE_URL').replace(/\/$/, '');
  if (paymentsEnabled && (!zarinpalMerchantId || !paymentCallbackBaseUrl.startsWith('https://'))) {
    throw new Error('FEATURE_PAYMENTS needs ZARINPAL_MERCHANT_ID and an HTTPS PAYMENT_CALLBACK_BASE_URL');
  }

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    otpPepper: required('OTP_PEPPER'),
    kavenegarApiKey: required('KAVENEGAR_API_KEY'),
    kavenegarTemplate: required('KAVENEGAR_TEMPLATE'),
    allowedOrigins,
    devLogCode: devLogCode(),
    aiEnabled: enabled('FEATURE_AI_DIAGNOSIS'),
    geminiApiKey: optional('GEMINI_API_KEY'),
    geminiModel: optional('GEMINI_MODEL') || 'gemini-2.5-flash',
    newBookingsEnabled: enabled('FEATURE_NEW_BOOKINGS'),
    paymentsEnabled,
    technicianMatchingEnabled: enabled('FEATURE_TECHNICIAN_MATCHING'),
    escrowReleaseEnabled: enabled('FEATURE_ESCROW_RELEASE'),
    zarinpalMerchantId,
    zarinpalSandbox: process.env.ZARINPAL_SANDBOX === 'true',
    paymentCallbackBaseUrl,
    // Every AI diagnosis is a paid call to Gemini. Without a ceiling one client holding a valid
    // session token can run the whole monthly spend cap down in minutes. The window is short on
    // purpose so a legitimate user who hits the ceiling is unblocked within a minute.
    aiRateLimit: positiveInt('AI_RATE_LIMIT_PER_MINUTE', 10),
    // Provider calls get a bounded retry budget so a single Zarinpal/Kavenegar/Gemini blip does
    // not surface as a user-visible 503, while a genuinely dead provider fails fast via the breaker.
    providerRetryAttempts: positiveInt('PROVIDER_RETRY_ATTEMPTS', 3)
  };
}
