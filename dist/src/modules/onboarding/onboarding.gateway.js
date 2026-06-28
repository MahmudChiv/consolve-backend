"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OnboardingGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const ws_1 = require("ws");
const sdk_1 = require("@deepgram/sdk");
const elevenlabs_js_1 = require("@elevenlabs/elevenlabs-js");
const config_1 = require("@nestjs/config");
const onboarding_service_1 = require("./onboarding.service");
const onboarding_session_service_1 = require("./session/onboarding-session.service");
let OnboardingGateway = OnboardingGateway_1 = class OnboardingGateway {
    onboardingService;
    sessionService;
    configService;
    server;
    logger = new common_1.Logger(OnboardingGateway_1.name);
    socketContextMap = new Map();
    constructor(onboardingService, sessionService, configService) {
        this.onboardingService = onboardingService;
        this.sessionService = sessionService;
        this.configService = configService;
    }
    handleDisconnect(client) {
        const ctx = this.socketContextMap.get(client);
        if (ctx?.deepgramSocket) {
            ctx.deepgramSocket.close();
        }
        this.socketContextMap.delete(client);
        this.logger.log('Voice client disconnected');
    }
    async handleJoin(payload, client) {
        const { userProfileId, userId } = payload;
        this.socketContextMap.set(client, {
            userProfileId,
            userId,
            deepgramSocket: null,
            pendingTranscript: '',
        });
        const session = await this.sessionService.get(userProfileId);
        if (!session) {
            const iter = this.onboardingService.processMessage(userId, userProfileId, '__START__', 'voice');
            await this.consumeAIStream(client, iter);
        }
        this.logger.log(`Voice session joined: profile=${userProfileId}`);
    }
    async handleAudioChunk(data, client) {
        const ctx = this.socketContextMap.get(client);
        if (!ctx)
            throw new websockets_1.WsException('Must send "join" before streaming audio');
        if (!ctx.deepgramSocket) {
            ctx.deepgramSocket = await this.createDeepgramSocket(client, ctx);
        }
        ctx.deepgramSocket.sendMedia(data);
    }
    handleEndStream(client) {
        const ctx = this.socketContextMap.get(client);
        if (!ctx?.deepgramSocket)
            return;
        ctx.deepgramSocket.sendFinalize({ type: 'Finalize' });
        ctx.deepgramSocket.close();
        ctx.deepgramSocket = null;
    }
    async createDeepgramSocket(client, ctx) {
        const deepgramClient = new sdk_1.DeepgramClient({
            apiKey: this.configService.get('deepgram.apiKey'),
        });
        const socket = await deepgramClient.listen.v1.connect({
            Authorization: this.configService.get('deepgram.apiKey'),
            model: 'nova-2',
            language: 'en',
            smart_format: sdk_1.ListenV1SmartFormat.True,
            interim_results: sdk_1.ListenV1InterimResults.True,
            utterance_end_ms: '1000',
            vad_events: sdk_1.ListenV1VadEvents.True,
        });
        socket.on('open', () => {
            this.logger.debug('Deepgram socket open');
        });
        socket.on('message', async (response) => {
            if (response.type === 'Results') {
                const result = response;
                const transcript = result.channel?.alternatives?.[0]?.transcript ?? '';
                const isFinal = result.is_final;
                if (transcript) {
                    this.send(client, 'transcript', { text: transcript, isFinal });
                }
                if (isFinal && transcript.trim()) {
                    ctx.pendingTranscript = transcript.trim();
                    try {
                        const iter = this.onboardingService.processMessage(ctx.userId, ctx.userProfileId, ctx.pendingTranscript, 'voice');
                        await this.consumeAIStream(client, iter);
                    }
                    catch (err) {
                        const message = err instanceof Error ? err.message : 'Unknown error';
                        this.logger.error('Voice pipeline error', err);
                        this.send(client, 'error', { message });
                    }
                    ctx.pendingTranscript = '';
                }
            }
        });
        socket.on('error', (err) => {
            this.logger.error('Deepgram error', err);
            this.send(client, 'error', { message: 'Speech recognition error' });
        });
        socket.on('close', () => {
            this.logger.debug('Deepgram socket closed');
        });
        socket.connect();
        return socket;
    }
    async consumeAIStream(client, iter) {
        let fullAiText = '';
        for await (const event of iter) {
            if (event.type === 'chunk') {
                fullAiText += event.data;
                this.send(client, 'ai_text', { chunk: event.data });
            }
            else if (event.type === 'identity') {
                this.send(client, 'identity', JSON.parse(event.data));
            }
            else if (event.type === 'done') {
                this.send(client, 'done', JSON.parse(event.data));
            }
        }
        if (fullAiText) {
            await this.synthesiseAndStream(client, fullAiText);
        }
    }
    async synthesiseAndStream(client, text) {
        const elevenlabs = new elevenlabs_js_1.ElevenLabsClient({
            apiKey: this.configService.get('elevenlabs.apiKey'),
        });
        const voiceId = this.configService.get('elevenlabs.voiceId');
        try {
            const audioStream = await elevenlabs.textToSpeech.stream(voiceId, {
                text,
                modelId: 'eleven_multilingual_v2',
                outputFormat: 'mp3_44100_128',
            });
            for await (const chunk of audioStream) {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(chunk, { binary: true });
                }
            }
        }
        catch (err) {
            this.logger.error('ElevenLabs TTS error', err);
            this.send(client, 'error', { message: 'Text-to-speech unavailable' });
        }
    }
    send(client, event, data) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(JSON.stringify({ event, data }));
        }
    }
};
exports.OnboardingGateway = OnboardingGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", ws_1.Server)
], OnboardingGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ws_1.WebSocket]),
    __metadata("design:returntype", Promise)
], OnboardingGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('audio_chunk'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Buffer,
        ws_1.WebSocket]),
    __metadata("design:returntype", Promise)
], OnboardingGateway.prototype, "handleAudioChunk", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('end_stream'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ws_1.WebSocket]),
    __metadata("design:returntype", void 0)
], OnboardingGateway.prototype, "handleEndStream", null);
exports.OnboardingGateway = OnboardingGateway = OnboardingGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        path: '/ws/onboarding',
        cors: { origin: '*', credentials: true },
    }),
    __metadata("design:paramtypes", [onboarding_service_1.OnboardingService,
        onboarding_session_service_1.OnboardingSessionService,
        config_1.ConfigService])
], OnboardingGateway);
//# sourceMappingURL=onboarding.gateway.js.map