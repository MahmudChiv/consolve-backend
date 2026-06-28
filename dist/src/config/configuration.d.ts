declare const _default: () => {
    port: number;
    nodeEnv: string;
    database: {
        url: string | undefined;
    };
    jwt: {
        accessSecret: string | undefined;
        refreshSecret: string | undefined;
        accessExpiry: number;
        refreshExpiry: number;
    };
    redis: {
        url: string | undefined;
        host: string;
        port: number;
        password: string | undefined;
    };
    twilio: {
        accountSid: string | undefined;
        authToken: string | undefined;
        phoneNumber: string | undefined;
    };
    otp: {
        expirySeconds: number;
    };
    gemini: {
        apiKey: string | undefined;
    };
    deepgram: {
        apiKey: string | undefined;
    };
    elevenlabs: {
        apiKey: string | undefined;
        voiceId: string | undefined;
    };
};
export default _default;
