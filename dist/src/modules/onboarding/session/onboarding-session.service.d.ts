import { RedisService } from '../../common/redis/redis.service';
import type { OnboardingSession } from '../interfaces/onboarding-session.interface';
export declare class OnboardingSessionService {
    private readonly redisService;
    private readonly logger;
    constructor(redisService: RedisService);
    get(userProfileId: string): Promise<OnboardingSession | null>;
    save(session: OnboardingSession): Promise<void>;
    create(userProfileId: string, userId: string, firstName: string): Promise<OnboardingSession>;
    del(userProfileId: string): Promise<void>;
}
