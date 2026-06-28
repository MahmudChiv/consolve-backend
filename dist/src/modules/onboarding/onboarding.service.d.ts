import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnboardingSessionService } from './session/onboarding-session.service';
import { UpdateLocationDto } from './dto/update-location.dto';
export declare class OnboardingService {
    private readonly prismaService;
    private readonly sessionService;
    private readonly configService;
    private readonly logger;
    private readonly genAI;
    private readonly model;
    constructor(prismaService: PrismaService, sessionService: OnboardingSessionService, configService: ConfigService);
    private buildSystemInstruction;
    processMessage(userId: string, userProfileId: string, userMessage: string, mode?: 'text' | 'voice'): AsyncGenerator<{
        type: 'chunk' | 'identity' | 'done';
        data: string;
    }>;
    startSession(userId: string, userProfileId: string): AsyncGenerator<{
        type: 'chunk' | 'identity' | 'done';
        data: string;
    }>;
    finaliseLocation(userId: string, userProfileId: string, dto: UpdateLocationDto): Promise<object>;
    getSessionState(userId: string, userProfileId: string): Promise<object>;
    private extractDataBlock;
    private upsertIdentity;
    private buildIdentityPayload;
}
