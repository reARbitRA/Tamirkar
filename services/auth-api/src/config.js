function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('replace-with-') || value.includes('change-this') || value.includes('example.invalid')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig() {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    host: process.env.HOST ?? '0.0.0.0',
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    otpPepper: required('OTP_PEPPER'),
    kavenegarApiKey: required('KAVENEGAR_API_KEY'),
    kavenegarTemplate: required('KAVENEGAR_TEMPLATE'),
    allowedOrigins,
    devLogCode: process.env.OTP_DEV_LOG_CODE === 'true'
  };
}
