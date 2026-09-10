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
  // The backend's own public URL, used to build the follow-up access
  // link's landing page (see routes/followUpLanding.routes.ts) — a real
  // https:// URL so WhatsApp actually renders it as a tappable link
  // (unlike the cbipes:// scheme itself, which WhatsApp never linkifies).
  publicBaseUrl: optional('PUBLIC_BASE_URL', 'https://msme-utkarsh-backend.onrender.com'),
  // Where the landing page's "don't have the app?" fallback points.
  // Update this env var on Render (no redeploy needed) whenever a new
  // APK build is cut — it is NOT derivable from code, since EAS build
  // pages are per-build.
  apkDownloadUrl: optional(
    'APK_DOWNLOAD_URL',
    'https://expo.dev/accounts/chaitanyas-team1005/projects/msme-utkarsh/builds/c9f1f07f-6ad8-4300-b657-a3a86e038a80'
  ),
};

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';
