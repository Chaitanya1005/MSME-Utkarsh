import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '4000'), 10),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  corsAllowedOrigins: optional('CORS_ALLOWED_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Genuinely optional (spec: "make the code configuration-ready...
  // without credentials"). Undefined means the Sarvam provider is not
  // selected — see providers/index.ts — and every other part of the
  // application continues to work exactly as before.
  sarvamApiKey: process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim() !== ''
    ? process.env.SARVAM_API_KEY
    : undefined,
};

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';
