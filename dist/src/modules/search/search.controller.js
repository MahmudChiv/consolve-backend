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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const token_blacklist_guard_1 = require("../common/guards/token-blacklist.guard");
const search_dto_1 = require("./dto/search.dto");
const nearby_search_dto_1 = require("./dto/nearby-search.dto");
const search_service_1 = require("./search.service");
let SearchController = class SearchController {
    searchService;
    constructor(searchService) {
        this.searchService = searchService;
    }
    async search(dto) {
        const data = await this.searchService.search(dto);
        return {
            success: true,
            message: 'Search results retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async nearby(dto) {
        const data = await this.searchService.searchNearby(dto);
        return {
            success: true,
            message: 'Nearby providers retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async getCategories() {
        const data = await this.searchService.getCategories();
        return {
            success: true,
            message: 'Categories retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async getProfile(profileId) {
        const data = await this.searchService.getProfile(profileId);
        return {
            success: true,
            message: 'Provider profile retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
};
exports.SearchController = SearchController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'AI-powered natural language search',
        description: `
Accepts a natural language query (English or Nigerian Pidgin), parses intent with Gemini 1.5 Flash,
queries the Identity table, ranks results by composite score, and generates explainability sentences
for the top 5 results.

**Caching:** Identical queries (same text + coordinates) return cached results within 5 minutes
and include \`"cached": true\` in the response.

**Fallback:** If Gemini is unavailable, the system falls back to keyword matching — the user
never receives an error.
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: search_dto_1.SearchDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Ranked list of matched providers with explainability',
        schema: {
            example: {
                success: true,
                message: 'Search results retrieved',
                data: {
                    query: 'trusted tailor near Lagos senator wear',
                    parsedIntent: {
                        profession: 'tailor',
                        location: 'Lagos',
                        experienceMin: null,
                        specialties: ['senator wear'],
                        urgency: 'unspecified',
                        priceMax: null,
                    },
                    results: [
                        {
                            userProfileId: 'uuid',
                            firstName: 'Emeka',
                            lastName: 'Okafor',
                            avatarUrl: 'https://example.com/avatar.jpg',
                            profession: 'Tailor',
                            summary: 'Experienced Lagos-based tailor...',
                            expertise: ['Senator wear', 'Agbada', 'Ankara'],
                            experience: 8,
                            city: 'Lagos',
                            state: 'Lagos',
                            pricing: { min: 15000, max: 150000, currency: 'NGN' },
                            rankScore: 7,
                            explanation: 'Emeka matches because he is a Lagos-based tailor with 8 years specialising in senator wear.',
                            distanceKm: 2.3,
                        },
                    ],
                    total: 1,
                    cached: false,
                },
                timestamp: '2026-06-28T09:00:00.000Z',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Validation error' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [search_dto_1.SearchDto]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('nearby'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Find providers within a geographic radius',
        description: 'Returns providers within `radius` km of the given coordinates, sorted by distance ascending. ' +
            'Optionally filter by profession. Distance is calculated using the Haversine formula.',
    }),
    (0, swagger_1.ApiQuery)({ name: 'latitude', required: true, type: Number, example: 6.5244 }),
    (0, swagger_1.ApiQuery)({ name: 'longitude', required: true, type: Number, example: 3.3792 }),
    (0, swagger_1.ApiQuery)({
        name: 'radius',
        required: false,
        type: Number,
        example: 10,
        description: 'Radius in km (default 10, max 100)',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'profession',
        required: false,
        type: String,
        example: 'tailor',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Distance-sorted list of nearby providers' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [nearby_search_dto_1.NearbySearchDto]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "nearby", null);
__decorate([
    (0, common_1.Get)('categories'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get all available profession categories',
        description: 'Returns a distinct, alphabetically sorted list of professions in the Identity table. ' +
            'Result is cached in Redis for 1 hour.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'List of distinct profession categories',
        schema: {
            example: {
                success: true,
                message: 'Categories retrieved',
                data: {
                    categories: ['electrician', 'mechanic', 'plumber', 'tailor'],
                    cached: false,
                },
                timestamp: '2026-06-28T09:00:00.000Z',
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "getCategories", null);
__decorate([
    (0, common_1.Get)(':profileId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a single provider public profile',
        description: 'Returns the merged Identity + UserProfile for a specific provider. ' +
            'Cached in Redis for 10 minutes.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'profileId',
        description: 'The UserProfile UUID of the provider',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Provider public profile' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Provider profile not found' }),
    __param(0, (0, common_1.Param)('profileId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "getProfile", null);
exports.SearchController = SearchController = __decorate([
    (0, swagger_1.ApiTags)('Search'),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, common_1.Controller)('search'),
    __metadata("design:paramtypes", [search_service_1.SearchService])
], SearchController);
//# sourceMappingURL=search.controller.js.map