"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    port: parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    database: {
        url: process.env.DATABASE_URL,
    },
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiry: parseInt(process.env.JWT_ACCESS_EXPIRY ?? '900', 10),
        refreshExpiry: parseInt(process.env.JWT_REFRESH_EXPIRY ?? '604800', 10),
    },
    redis: {
        url: process.env.REDIS_URL ?? undefined,
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD ?? undefined,
    },
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    otp: {
        expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS ?? '600', 10),
    },
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
    },
    deepgram: {
        apiKey: process.env.DEEPGRAM_API_KEY,
    },
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID,
    },
});
//# sourceMappingURL=configuration.js.map