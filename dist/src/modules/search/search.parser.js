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
var SearchParser_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchParser = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const generative_ai_1 = require("@google/generative-ai");
const NIGERIAN_LOCATIONS = [
    'lagos', 'abuja', 'ibadan', 'kano', 'akure', 'benin', 'enugu',
    'port harcourt', 'calabar', 'warri', 'jos', 'kaduna', 'owerri',
    'asaba', 'uyo', 'abeokuta', 'ilorin', 'oyo', 'onitsha', 'maiduguri',
    'zaria', 'ondo', 'sokoto', 'minna', 'makurdi', 'bauchi', 'yola',
];
const EXTRACTION_PROMPT = (query) => `
You are a search intent parser for a Nigerian marketplace app called Consolve.
Parse this search query and return ONLY valid JSON — no markdown, no explanation.

Query: "${query}"

Return this exact JSON structure:
{
  "profession": "string or null — type of service provider needed, normalised to lowercase English (e.g. tailor, electrician, plumber)",
  "location": "string or null — Nigerian city or state mentioned",
  "experienceMin": "number or null — minimum years of experience if mentioned",
  "specialties": ["array of specific skills or services mentioned"],
  "urgency": "now|scheduled|unspecified",
  "priceMax": "number or null — maximum price in Naira if mentioned"
}

Pidgin translation rules:
- "wey dey" = who does / that does
- "for" = in / at (location)
- "make" / "dey make" = who makes
- "good work" = high quality / experienced

Return ONLY the JSON object.
`.trim();
let SearchParser = SearchParser_1 = class SearchParser {
    configService;
    logger = new common_1.Logger(SearchParser_1.name);
    model;
    constructor(configService) {
        this.configService = configService;
        const apiKey = this.configService.get('gemini.apiKey');
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        this.model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: { responseMimeType: 'application/json' },
        });
    }
    async parseIntent(query) {
        try {
            const result = await this.model.generateContent(EXTRACTION_PROMPT(query));
            const text = result.response
                .text()
                .trim()
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            const parsed = JSON.parse(text);
            return {
                profession: parsed.profession ?? null,
                location: parsed.location ?? null,
                experienceMin: typeof parsed.experienceMin === 'number' ? parsed.experienceMin : null,
                specialties: Array.isArray(parsed.specialties) ? parsed.specialties : [],
                urgency: ['now', 'scheduled', 'unspecified'].includes(parsed.urgency)
                    ? parsed.urgency
                    : 'unspecified',
                priceMax: typeof parsed.priceMax === 'number' ? parsed.priceMax : null,
            };
        }
        catch (err) {
            this.logger.warn(`Gemini intent parsing failed — using keyword fallback. Reason: ${err instanceof Error ? err.message : String(err)}`);
            return this.keywordFallback(query);
        }
    }
    keywordFallback(query) {
        const lowerQuery = query.toLowerCase();
        let location = null;
        for (const city of NIGERIAN_LOCATIONS) {
            if (lowerQuery.includes(city)) {
                location = city;
                break;
            }
        }
        const expMatch = lowerQuery.match(/(\d+)\s*(?:years?|yrs?)/);
        const experienceMin = expMatch ? parseInt(expMatch[1]) : null;
        const stopWords = new Set([
            'find', 'me', 'a', 'an', 'the', 'i', 'need', 'want', 'looking',
            'for', 'near', 'in', 'at', 'trusted', 'good', 'best', 'urgent',
        ]);
        const profession = lowerQuery
            .split(/\s+/)
            .filter((w) => w.length > 2 && !stopWords.has(w) && !/\d/.test(w))
            .shift() ?? null;
        const urgency = lowerQuery.includes('urgent') || lowerQuery.includes('now')
            ? 'now'
            : 'unspecified';
        return {
            profession,
            location,
            experienceMin,
            specialties: [],
            urgency,
            priceMax: null,
        };
    }
};
exports.SearchParser = SearchParser;
exports.SearchParser = SearchParser = SearchParser_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SearchParser);
//# sourceMappingURL=search.parser.js.map