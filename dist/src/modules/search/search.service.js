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
var SearchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
const search_parser_1 = require("./search.parser");
const search_geo_1 = require("./search.geo");
const search_ranker_1 = require("./search.ranker");
const SEARCH_CACHE_TTL = 300;
const PROFILE_CACHE_TTL = 600;
const CATEGORIES_CACHE_TTL = 3600;
const TOP_N_FOR_EXPLANATIONS = 5;
let SearchService = SearchService_1 = class SearchService {
    prismaService;
    redisService;
    searchParser;
    configService;
    logger = new common_1.Logger(SearchService_1.name);
    explainerModel;
    constructor(prismaService, redisService, searchParser, configService) {
        this.prismaService = prismaService;
        this.redisService = redisService;
        this.searchParser = searchParser;
        this.configService = configService;
        const apiKey = this.configService.get('gemini.apiKey');
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.explainerModel = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
        });
    }
    async search(dto) {
        const cacheKey = this.buildSearchCacheKey(dto.query, dto.latitude, dto.longitude);
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            this.logger.log(`Cache hit: ${cacheKey}`);
            return { ...JSON.parse(cached), cached: true };
        }
        const parsedIntent = await this.searchParser.parseIntent(dto.query);
        this.logger.log(`Parsed intent for "${dto.query}": ${JSON.stringify(parsedIntent)}`);
        const rawResults = await this.queryIdentities(parsedIntent);
        this.logger.log(`DB returned ${rawResults.length} results for query "${dto.query}"`);
        const ranked = this.rankResults(rawResults, parsedIntent, dto.latitude, dto.longitude);
        const topWithExplanations = await this.addExplanations(ranked.slice(0, TOP_N_FOR_EXPLANATIONS), parsedIntent);
        const remaining = ranked.slice(TOP_N_FOR_EXPLANATIONS);
        const results = [...topWithExplanations, ...remaining];
        const payload = {
            query: dto.query,
            parsedIntent,
            results,
            total: results.length,
            cached: false,
        };
        await this.redisService.set(cacheKey, JSON.stringify(payload), SEARCH_CACHE_TTL);
        return payload;
    }
    async searchNearby(dto) {
        const { latitude, longitude, radius = 10, profession } = dto;
        const rawIdentities = await this.prismaService.identity.findMany({
            where: {
                deletedAt: null,
                latitude: { not: null },
                longitude: { not: null },
                ...(profession
                    ? { profession: { contains: profession, mode: 'insensitive' } }
                    : {}),
                userProfile: { onboardingStatus: client_1.OnboardingStatus.COMPLETED },
            },
            include: { userProfile: true },
            take: 200,
        });
        const withDistance = rawIdentities
            .map((identity) => {
            const distanceKm = (0, search_geo_1.haversineDistanceKm)(latitude, longitude, identity.latitude, identity.longitude);
            return { ...this.toProviderShape(identity), distanceKm };
        })
            .filter((p) => p.distanceKm <= radius)
            .sort((a, b) => a.distanceKm - b.distanceKm);
        return {
            latitude,
            longitude,
            radius,
            results: withDistance,
            total: withDistance.length,
        };
    }
    async getCategories() {
        const cacheKey = 'search:categories';
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return { categories: JSON.parse(cached), cached: true };
        }
        const rows = await this.prismaService.identity.findMany({
            where: {
                deletedAt: null,
                profession: { not: null },
                userProfile: { onboardingStatus: client_1.OnboardingStatus.COMPLETED },
            },
            select: { profession: true },
            orderBy: { profession: 'asc' },
        });
        const seen = new Set();
        const categories = [];
        for (const row of rows) {
            if (row.profession && !seen.has(row.profession)) {
                seen.add(row.profession);
                categories.push(row.profession);
            }
        }
        await this.redisService.set(cacheKey, JSON.stringify(categories), CATEGORIES_CACHE_TTL);
        return { categories, cached: false };
    }
    async getProfile(profileId) {
        const cacheKey = `profile:${profileId}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }
        const identity = await this.prismaService.identity.findFirst({
            where: {
                userProfileId: profileId,
                deletedAt: null,
            },
            include: { userProfile: true },
        });
        if (!identity) {
            throw new common_1.NotFoundException('Provider profile not found');
        }
        const profile = this.toProviderShape(identity);
        await this.redisService.set(cacheKey, JSON.stringify({ ...profile, cached: false }), PROFILE_CACHE_TTL);
        return { ...profile, cached: false };
    }
    async queryIdentities(intent) {
        return this.prismaService.identity.findMany({
            where: {
                deletedAt: null,
                userProfile: { onboardingStatus: client_1.OnboardingStatus.COMPLETED },
                ...(intent.profession
                    ? { profession: { contains: intent.profession, mode: 'insensitive' } }
                    : {}),
                ...(intent.location
                    ? {
                        OR: [
                            { city: { contains: intent.location, mode: 'insensitive' } },
                            { state: { contains: intent.location, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
                ...(intent.experienceMin != null
                    ? { experience: { gte: intent.experienceMin } }
                    : {}),
                ...(intent.specialties?.length
                    ? { expertise: { hasSome: intent.specialties } }
                    : {}),
            },
            include: { userProfile: true },
            take: 50,
        });
    }
    rankResults(identities, intent, userLat, userLon) {
        const ranked = identities.map((identity) => {
            const provider = this.toProviderShape(identity);
            const distanceKm = userLat != null &&
                userLon != null &&
                identity.latitude != null &&
                identity.longitude != null
                ? (0, search_geo_1.haversineDistanceKm)(userLat, userLon, identity.latitude, identity.longitude)
                : undefined;
            const rankScore = (0, search_ranker_1.computeRankScore)(provider, {
                location: intent.location,
                experienceMin: intent.experienceMin,
                specialties: intent.specialties,
            }, distanceKm);
            return { ...provider, rankScore, distanceKm };
        });
        return (0, search_ranker_1.sortByRank)(ranked);
    }
    async addExplanations(providers, intent) {
        if (providers.length === 0)
            return providers;
        try {
            const prompt = `
You are a helpful AI assistant for Consolve, an African marketplace app.
For each provider below, write ONE concise sentence explaining why they are a good match for this search.
Search intent: profession="${intent.profession ?? 'unspecified'}", location="${intent.location ?? 'unspecified'}", specialties=${JSON.stringify(intent.specialties)}.

Providers (JSON array):
${JSON.stringify(providers.map((p) => ({
                id: p.userProfileId,
                name: `${p.firstName} ${p.lastName}`,
                profession: p.profession,
                expertise: p.expertise,
                experience: p.experience,
                city: p.city,
                state: p.state,
            })))}

Return ONLY a JSON array of objects: [{ "id": "...", "explanation": "..." }]
`.trim();
            const result = await this.explainerModel.generateContent(prompt);
            const text = result.response
                .text()
                .trim()
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            const explanations = JSON.parse(text);
            const explanationMap = new Map(explanations.map((e) => [e.id, e.explanation]));
            return providers.map((p) => ({
                ...p,
                explanation: explanationMap.get(p.userProfileId) ?? undefined,
            }));
        }
        catch (err) {
            this.logger.warn(`Gemini explanation generation failed: ${err instanceof Error ? err.message : String(err)}`);
            return providers;
        }
    }
    toProviderShape(identity) {
        return {
            userProfileId: identity.userProfileId,
            firstName: identity.userProfile.firstName,
            lastName: identity.userProfile.lastName,
            avatarUrl: identity.userProfile.avatarUrl ?? null,
            profession: identity.profession ?? null,
            summary: identity.summary ?? null,
            expertise: identity.expertise ?? [],
            experience: identity.experience ?? null,
            city: identity.city ?? null,
            state: identity.state ?? null,
            latitude: identity.latitude ?? null,
            longitude: identity.longitude ?? null,
            pricing: identity.pricing,
            availability: identity.availability,
        };
    }
    buildSearchCacheKey(query, latitude, longitude) {
        const raw = `${query}|${latitude ?? ''}|${longitude ?? ''}`;
        const hash = (0, crypto_1.createHash)('sha256').update(raw).digest('hex').slice(0, 16);
        return `search:${hash}`;
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = SearchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        search_parser_1.SearchParser,
        config_1.ConfigService])
], SearchService);
//# sourceMappingURL=search.service.js.map