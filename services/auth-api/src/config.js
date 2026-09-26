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
    devLogCode: process.env.OTP_DEV_LOG_CODE === 'true',
    aiEnabled: enabled('FEATURE_AI_DIAGNOSIS'),
    geminiApiKey: optional('GEMINI_API_KEY'),
    geminiModel: optional('GEMINI_MODEL') || 'gemini-2.5-flash',
    newBookingsEnabled: enabled('FEATURE_NEW_BOOKINGS'),
    paymentsEnabled,
    technicianMatchingEnabled: enabled('FEATURE_TECHNICIAN_MATCHING'),
    escrowReleaseEnabled: enabled('FEATURE_ESCROW_RELEASE'),
    zarinpalMerchantId,
    zarinpalSandbox: process.env.ZARINPAL_SANDBOX === 'true',
    paymentCallbackBaseUrl
  };
}
