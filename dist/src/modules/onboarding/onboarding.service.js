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
var OnboardingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
const prisma_service_1 = require("../common/prisma/prisma.service");
const onboarding_session_service_1 = require("./session/onboarding-session.service");
const client_1 = require("@prisma/client");
const STEP_FIELD_MAP = {
    0: 'profession',
    1: 'expertise',
    2: 'availability',
    3: 'experience',
    4: 'pricing',
    5: 'summary',
};
let OnboardingService = OnboardingService_1 = class OnboardingService {
    prismaService;
    sessionService;
    configService;
    logger = new common_1.Logger(OnboardingService_1.name);
    genAI;
    model;
    constructor(prismaService, sessionService, configService) {
        this.prismaService = prismaService;
        this.sessionService = sessionService;
        this.configService = configService;
        const apiKey = this.configService.get('gemini.apiKey');
        this.genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: this.buildSystemInstruction(),
        });
    }
    buildSystemInstruction() {
        return `
You are Consolve's friendly onboarding AI. Your job is to collect professional information from a new service provider or trader through a warm, conversational interview.

RULES:
1. Always greet the user by their first name on the very first message.
2. Follow this exact question sequence — do NOT skip or reorder:
   STEP 0: Ask what kind of trade or service they offer.
   STEP 1: If their step 0 answer is broad (e.g. "software engineer", "trader", "consultant"), ask a narrowing follow-up to pin down their specialty (e.g. "Are you a frontend, backend, or fullstack engineer?"). If their answer was already specific (e.g. "plumber", "pastry chef"), skip to STEP 2 by immediately asking the availability question.
   STEP 2: Ask about their availability (full-time, part-time). If part-time, ask a follow-up: do they prefer weekdays, weekends, or specific hours?
   STEP 3: Ask how many years of experience they have.
   STEP 4: Based on everything collected (profession, specialty, experience, market context in Nigeria), generate a realistic PRICE RANGE in Naira (₦). Present it as "Based on your profile, a fair rate would be ₦X,XXX – ₦XX,XXX per hour/item/project." Confirm with the user.
   STEP 5: Generate a warm, professional TL;DR summary (2–3 sentences) about the user as if writing their public bio. Then say the onboarding is complete.

3. After each answer, extract the relevant data field clearly in your response — the backend will parse it.
4. Be warm, professional, and concise. Never ask more than one question per turn.
5. Respond in JSON format ONLY when extracting data — otherwise respond in plain conversational text.

DATA EXTRACTION FORMAT (use this when you have collected a field):
When you have extracted a field, end your message with a JSON block like:
<<<DATA>>>
{"field": "profession", "value": "Software Engineer"}
<<<END>>>

For pricing, the field is "pricing" and the value should be the range string.
For summary, the field is "summary" and the value is the 2-3 sentence bio.
`.trim();
    }
    async *processMessage(userId, userProfileId, userMessage, mode = 'text') {
        let session = await this.sessionService.get(userProfileId);
        if (!session) {
            const profile = await this.prismaService.userProfile.findFirst({
                where: { id: userProfileId, userId },
                include: { user: true },
            });
            if (!profile)
                throw new common_1.NotFoundException('User profile not found');
            if (profile.type === client_1.UserType.CUSTOMER) {
                throw new common_1.ForbiddenException('Customers do not require AI onboarding');
            }
            session = await this.sessionService.create(userProfileId, userId, profile.firstName);
            await this.upsertIdentity(userId, userProfileId, {});
            await this.prismaService.userProfile.update({
                where: { id: userProfileId },
                data: { onboardingStatus: client_1.OnboardingStatus.IN_PROGRESS },
            });
        }
        session.lastMode = mode;
        session.lastActiveAt = new Date().toISOString();
        const chat = this.model.startChat({
            history: session.conversationHistory.map((t) => ({
                role: t.role,
                parts: [{ text: t.content }],
            })),
        });
        const streamResult = await chat.sendMessageStream(userMessage);
        let fullResponse = '';
        for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            fullResponse += text;
            const clean = text.replace(/<<<DATA>>>[\s\S]*?<<<END>>>/g, '').trim();
            if (clean) {
                yield { type: 'chunk', data: clean };
            }
        }
        session.conversationHistory.push({ role: 'user', content: userMessage });
        session.conversationHistory.push({ role: 'model', content: fullResponse });
        const extracted = this.extractDataBlock(fullResponse);
        if (extracted) {
            const { field, value } = extracted;
            session.identityState[field] = value;
            await this.upsertIdentity(userId, userProfileId, session.identityState);
            session.currentStep = Math.min(session.currentStep + 1, 5);
            yield {
                type: 'identity',
                data: JSON.stringify(this.buildIdentityPayload(session.identityState)),
            };
            if (field === 'summary') {
                await this.prismaService.userProfile.update({
                    where: { id: userProfileId },
                    data: { onboardingStatus: client_1.OnboardingStatus.COMPLETED },
                });
                await this.sessionService.del(userProfileId);
                yield { type: 'done', data: JSON.stringify(this.buildIdentityPayload(session.identityState)) };
                return;
            }
        }
        await this.sessionService.save(session);
    }
    async *startSession(userId, userProfileId) {
        yield* this.processMessage(userId, userProfileId, '__START__', 'text');
    }
    async finaliseLocation(userId, userProfileId, dto) {
        const identity = await this.prismaService.identity.findUnique({
            where: { userProfileId },
        });
        if (!identity) {
            throw new common_1.BadRequestException('AI onboarding must be completed before adding location.');
        }
        const updated = await this.prismaService.identity.update({
            where: { userProfileId },
            data: {
                latitude: dto.latitude,
                longitude: dto.longitude,
                city: dto.city,
                state: dto.state,
                country: dto.country,
            },
        });
        await this.prismaService.userProfile.update({
            where: { id: userProfileId },
            data: { onboardingStatus: client_1.OnboardingStatus.COMPLETED },
        });
        this.logger.log(`Onboarding fully completed for profile ${userProfileId}`);
        return updated;
    }
    async getSessionState(userId, userProfileId) {
        const identity = await this.prismaService.identity.findUnique({
            where: { userProfileId },
        });
        const session = await this.sessionService.get(userProfileId);
        return {
            identity: identity ?? {},
            currentStep: session?.currentStep ?? 0,
            isComplete: !session && !!identity,
        };
    }
    extractDataBlock(text) {
        const match = text.match(/<<<DATA>>>([\s\S]*?)<<<END>>>/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[1].trim());
        }
        catch {
            return null;
        }
    }
    async upsertIdentity(userId, userProfileId, state) {
        const expertise = state.expertise
            ? state.expertise
                .split(/[,;|]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        let experience;
        if (state.experience) {
            const match = state.experience.match(/\d+/);
            experience = match ? parseInt(match[0], 10) : undefined;
        }
        let availability;
        if (state.availability) {
            const raw = state.availability.toLowerCase();
            availability = {
                description: state.availability,
                type: raw.includes('full') ? 'full-time' : 'part-time',
                ...(raw.includes('weekday') && { preferredDays: 'weekdays' }),
                ...(raw.includes('weekend') && { preferredDays: 'weekends' }),
            };
        }
        let pricing;
        if (state.pricing) {
            const raw = state.pricing;
            const nums = raw.replace(/[₦,\s]/g, ' ').match(/\d+/g);
            const unit = /\/hr/i.test(raw) ? 'per_hour'
                : /\/day/i.test(raw) ? 'per_day'
                    : /\/item/i.test(raw) ? 'per_item'
                        : 'per_project';
            pricing = nums && nums.length >= 2
                ? { min: parseInt(nums[0]), max: parseInt(nums[1]), currency: 'NGN', unit, raw }
                : nums && nums.length === 1
                    ? { min: parseInt(nums[0]), currency: 'NGN', unit, raw }
                    : { raw, currency: 'NGN', unit };
        }
        await this.prismaService.identity.upsert({
            where: { userProfileId },
            create: {
                userId,
                userProfileId,
                profession: state.profession,
                summary: state.summary,
                expertise,
                ...(experience !== undefined && { experience }),
                ...(availability !== undefined && { availability }),
                ...(pricing !== undefined && { pricing }),
            },
            update: {
                ...(state.profession !== undefined && { profession: state.profession }),
                ...(state.summary !== undefined && { summary: state.summary }),
                ...(state.expertise !== undefined && { expertise }),
                ...(experience !== undefined && { experience }),
                ...(availability !== undefined && { availability }),
                ...(pricing !== undefined && { pricing }),
            },
        });
    }
    buildIdentityPayload(state) {
        return {
            'TL;DR Summary': state.summary ?? null,
            Profession: state.profession ?? null,
            'Expertise/Specialty': state.expertise ?? null,
            'Pricing Intelligence': state.pricing ?? null,
            Experience: state.experience ?? null,
            Availability: state.availability ?? null,
        };
    }
};
exports.OnboardingService = OnboardingService;
exports.OnboardingService = OnboardingService = OnboardingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        onboarding_session_service_1.OnboardingSessionService,
        config_1.ConfigService])
], OnboardingService);
//# sourceMappingURL=onboarding.service.js.map