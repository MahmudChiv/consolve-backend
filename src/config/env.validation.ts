import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  // ── Database ──────────────────────────────────────────────────────────────
  /** Full PostgreSQL DSN — e.g. postgresql://user:pass@host:5432/dbname */
  DATABASE_URL: Joi.string().required(),

  // ── JWT ───────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.number().default(900),
  JWT_REFRESH_EXPIRY: Joi.number().default(604800),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // ── Twilio ────────────────────────────────────────────────────────────────
  TWILIO_ACCOUNT_SID: Joi.string().required(),
  TWILIO_AUTH_TOKEN: Joi.string().required(),
  TWILIO_PHONE_NUMBER: Joi.string().required(),
  OTP_EXPIRY_SECONDS: Joi.number().default(600),

  // ── AI Services ───────────────────────────────────────────────────────────
  GEMINI_API_KEY: Joi.string().required(),
  DEEPGRAM_API_KEY: Joi.string().required(),
  ELEVENLABS_API_KEY: Joi.string().required(),
  ELEVENLABS_VOICE_ID: Joi.string().required(),
});
