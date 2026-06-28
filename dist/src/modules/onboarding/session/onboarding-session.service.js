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
var OnboardingSessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingSessionService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../common/redis/redis.service");
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const KEY = (profileId) => `onboarding:session:${profileId}`;
let OnboardingSessionService = OnboardingSessionService_1 = class OnboardingSessionService {
    redisService;
    logger = new common_1.Logger(OnboardingSessionService_1.name);
    constructor(redisService) {
        this.redisService = redisService;
    }
    async get(userProfileId) {
        const raw = await this.redisService.get(KEY(userProfileId));
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            this.logger.warn(`Corrupt session for profile ${userProfileId} — discarding`);
            await this.del(userProfileId);
            return null;
        }
    }
    async save(session) {
        await this.redisService.set(KEY(session.userProfileId), JSON.stringify(session), SESSION_TTL_SECONDS);
    }
    async create(userProfileId, userId, firstName) {
        const session = {
            userProfileId,
            userId,
            firstName,
            currentStep: 0,
            identityState: {},
            conversationHistory: [],
            lastMode: 'text',
            lastActiveAt: new Date().toISOString(),
        };
        await this.save(session);
        this.logger.log(`New onboarding session created for profile ${userProfileId}`);
        return session;
    }
    async del(userProfileId) {
        await this.redisService.del(KEY(userProfileId));
    }
};
exports.OnboardingSessionService = OnboardingSessionService;
exports.OnboardingSessionService = OnboardingSessionService = OnboardingSessionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], OnboardingSessionService);
//# sourceMappingURL=onboarding-session.service.js.map