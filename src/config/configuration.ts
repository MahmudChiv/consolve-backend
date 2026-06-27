/**
 * configuration.ts
 *
 * Typed configuration factory for the NestJS ConfigModule.
 *
 * The ConfigModule.forRoot() call in AppModule loads this factory via
 * `load: [configuration]`. All environment variables are then accessible
 * as a typed object through ConfigService.get<T>('key.subkey').
 *
 * Example usage inside a service:
 *   this.configService.get<string>('jwt.accessSecret')
 *   this.configService.get<number>('otp.expirySeconds')
 */
export default () => ({
  /** Server port — defaults to 3000 if PORT is not set */
  port: parseInt(process.env.PORT ?? '3000', 10),

  /** Runtime environment — controls cookie security flags etc. */
  nodeEnv: process.env.NODE_ENV ?? 'development',

  database: {
    /** Full PostgreSQL connection string — used by PrismaPg adapter */
    url: process.env.DATABASE_URL,
  },

  jwt: {
    /** Secret used to sign/verify access tokens */
    accessSecret: process.env.JWT_ACCESS_SECRET,

    /** Secret used to sign/verify refresh tokens (separate from access secret) */
    refreshSecret: process.env.JWT_REFRESH_SECRET,

    /** Access token lifetime in seconds (default: 900 = 15 minutes) */
    accessExpiry: parseInt(process.env.JWT_ACCESS_EXPIRY ?? '900', 10),

    /** Refresh token lifetime in seconds (default: 604800 = 7 days) */
    refreshExpiry: parseInt(process.env.JWT_REFRESH_EXPIRY ?? '604800', 10),
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? undefined,
  },

  twilio: {
    /** Twilio Account SID — from https://console.twilio.com */
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    /** The Twilio phone number used to send SMS messages */
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  otp: {
    /** OTP lifetime in seconds (default: 600 = 10 minutes) */
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS ?? '600', 10),
  },
});
