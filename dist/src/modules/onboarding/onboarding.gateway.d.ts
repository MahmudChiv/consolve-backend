import { OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { ConfigService } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';
import { OnboardingSessionService } from './session/onboarding-session.service';
interface JoinPayload {
    userProfileId: string;
    userId: string;
}
export declare class OnboardingGateway implements OnGatewayDisconnect {
    private readonly onboardingService;
    private readonly sessionService;
    private readonly configService;
    server: Server;
    private readonly logger;
    private readonly socketContextMap;
    constructor(onboardingService: OnboardingService, sessionService: OnboardingSessionService, configService: ConfigService);
    handleDisconnect(client: WebSocket): void;
    handleJoin(payload: JoinPayload, client: WebSocket): Promise<void>;
    handleAudioChunk(data: Buffer, client: WebSocket): Promise<void>;
    handleEndStream(client: WebSocket): void;
    private createDeepgramSocket;
    private consumeAIStream;
    private synthesiseAndStream;
    private send;
}
export {};
