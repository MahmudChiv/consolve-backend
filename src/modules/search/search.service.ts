/**
 * search.service.ts
 *
 * Core search and matchmaking service.
 *
 * Flow:
 *   POST /search  →  parseIntent (Gemini) → queryDB → rank → explain (Gemini) → cache → return
 *   GET  /nearby  →  queryDB with lat/lon → haversine filter → sort by distance
 *   GET  /categories → distinct professions (Redis cached 1hr)
 *   GET  /:profileId  → single provider profile (Redis cached 10min)
 *
 * Cache strategy:
 *   search:<sha256(query+lat+lon)>  TTL 5 min
 *   profile:<profileId>             TTL 10 min
 *   search:categories               TTL 1 hr
 */
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
} from '@google/generative-ai';
import { createHash } from 'crypto';
import { OnboardingStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SearchParser, ParsedIntent } from './search.parser';
import { haversineDistanceKm } from './search.geo';
import {
  computeRankScore,
  sortByRank,
  RankableProvider,
  RankedProvider,
} from './search.ranker';
import { SearchDto } from './dto/search.dto';
import { NearbySearchDto } from './dto/nearby-search.dto';

const SEARCH_CACHE_TTL = 300;        // 5 minutes
const PROFILE_CACHE_TTL = 600;       // 10 minutes
const CATEGORIES_CACHE_TTL = 3600;   // 1 hour
const TOP_N_FOR_EXPLANATIONS = 5;

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly explainerModel: GenerativeModel;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly searchParser: SearchParser,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('gemini.apiKey')!;
    const genAI = new GoogleGenerativeAI(apiKey);
    this.explainerModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });
  }

  // ─── POST /search ──────────────────────────────────────────────────────────

  /**
   * Natural language search with AI intent parsing, ranking, and explainability.
   */
  async search(dto: SearchDto): Promise<Record<string, unknown>> {
    const cacheKey = this.buildSearchCacheKey(
      dto.query,
      dto.latitude,
      dto.longitude,
    );

    // ── 1. Cache hit ──────────────────────────────────────────────────────────
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit: ${cacheKey}`);
      return { ...JSON.parse(cached), cached: true };
    }

    // ── 2. Parse intent ───────────────────────────────────────────────────────
    const parsedIntent = await this.searchParser.parseIntent(dto.query);
    this.logger.log(
      `Parsed intent for "${dto.query}": ${JSON.stringify(parsedIntent)}`,
    );

    // ── 3. Query DB ───────────────────────────────────────────────────────────
    const rawResults = await this.queryIdentities(parsedIntent);
    this.logger.log(
      `DB returned ${rawResults.length} results for query "${dto.query}"`,
    );

    // ── 4. Rank ───────────────────────────────────────────────────────────────
    const ranked = this.rankResults(
      rawResults,
      parsedIntent,
      dto.latitude,
      dto.longitude,
    );

    // ── 5. Explanations (top N only) ──────────────────────────────────────────
    const topWithExplanations = await this.addExplanations(
      ranked.slice(0, TOP_N_FOR_EXPLANATIONS),
      parsedIntent,
    );

    // Append remaining results without explanations
    const remaining = ranked.slice(TOP_N_FOR_EXPLANATIONS);
    const results = [...topWithExplanations, ...remaining];

    // ── 6. Cache + return ─────────────────────────────────────────────────────
    const payload = {
      query: dto.query,
      parsedIntent,
      results,
      total: results.length,
      cached: false,
    };

    await this.redisService.set(
      cacheKey,
      JSON.stringify(payload),
      SEARCH_CACHE_TTL,
    );

    return payload;
  }

  // ─── GET /nearby ───────────────────────────────────────────────────────────

  /**
   * Find providers within `radius` km of the given coordinates.
   * Haversine computed in-memory — fine for hackathon scale.
   */
  async searchNearby(dto: NearbySearchDto): Promise<Record<string, unknown>> {
    const { latitude, longitude, radius = 10, profession } = dto;

    // Query providers that have coordinates
    const rawIdentities = await this.prismaService.identity.findMany({
      where: {
        deletedAt: null,
        latitude: { not: null },
        longitude: { not: null },
        ...(profession
          ? { profession: { contains: profession, mode: 'insensitive' } }
          : {}),
        userProfile: { onboardingStatus: OnboardingStatus.COMPLETED },
      },
      include: { userProfile: true },
      take: 200, // reasonable upper bound before in-memory filter
    });

    // Filter by radius and compute distances
    const withDistance = rawIdentities
      .map((identity) => {
        const distanceKm = haversineDistanceKm(
          latitude,
          longitude,
          identity.latitude!,
          identity.longitude!,
        );
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

  // ─── GET /categories ───────────────────────────────────────────────────────

  async getCategories(): Promise<Record<string, unknown>> {
    const cacheKey = 'search:categories';

    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return { categories: JSON.parse(cached), cached: true };
    }

    const rows = await this.prismaService.identity.findMany({
      where: {
        deletedAt: null,
        profession: { not: null },
        userProfile: { onboardingStatus: OnboardingStatus.COMPLETED },
      },
      select: { profession: true },
      orderBy: { profession: 'asc' },
    });

    // Deduplicate in-memory (distinct on String? field is safer this way)
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const row of rows) {
      if (row.profession && !seen.has(row.profession)) {
        seen.add(row.profession);
        categories.push(row.profession);
      }
    }

    await this.redisService.set(
      cacheKey,
      JSON.stringify(categories),
      CATEGORIES_CACHE_TTL,
    );

    return { categories, cached: false };
  }

  // ─── GET /:profileId ───────────────────────────────────────────────────────

  async getProfile(profileId: string): Promise<Record<string, unknown>> {
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
      throw new NotFoundException('Provider profile not found');
    }

    const profile = this.toProviderShape(identity);

    await this.redisService.set(
      cacheKey,
      JSON.stringify({ ...profile, cached: false }),
      PROFILE_CACHE_TTL,
    );

    return { ...profile, cached: false };
  }

  // ─── Private: DB query ────────────────────────────────────────────────────

  private async queryIdentities(intent: ParsedIntent) {
    return this.prismaService.identity.findMany({
      where: {
        deletedAt: null,
        userProfile: { onboardingStatus: OnboardingStatus.COMPLETED },
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

  // ─── Private: Ranking ─────────────────────────────────────────────────────

  private rankResults(
    identities: Awaited<ReturnType<typeof this.queryIdentities>>,
    intent: ParsedIntent,
    userLat?: number,
    userLon?: number,
  ): RankedProvider[] {
    const ranked = identities.map((identity) => {
      const provider = this.toProviderShape(identity) as RankableProvider;

      const distanceKm =
        userLat != null &&
        userLon != null &&
        identity.latitude != null &&
        identity.longitude != null
          ? haversineDistanceKm(
              userLat,
              userLon,
              identity.latitude,
              identity.longitude,
            )
          : undefined;

      const rankScore = computeRankScore(
        provider,
        {
          location: intent.location,
          experienceMin: intent.experienceMin,
          specialties: intent.specialties,
        },
        distanceKm,
      );

      return { ...provider, rankScore, distanceKm } as RankedProvider;
    });

    return sortByRank(ranked);
  }

  // ─── Private: Explainability ──────────────────────────────────────────────

  private async addExplanations(
    providers: RankedProvider[],
    intent: ParsedIntent,
  ): Promise<RankedProvider[]> {
    if (providers.length === 0) return providers;

    try {
      const prompt = `
You are a helpful AI assistant for Consolve, an African marketplace app.
For each provider below, write ONE concise sentence explaining why they are a good match for this search.
Search intent: profession="${intent.profession ?? 'unspecified'}", location="${intent.location ?? 'unspecified'}", specialties=${JSON.stringify(intent.specialties)}.

Providers (JSON array):
${JSON.stringify(
  providers.map((p) => ({
    id: p.userProfileId,
    name: `${p.firstName} ${p.lastName}`,
    profession: p.profession,
    expertise: p.expertise,
    experience: p.experience,
    city: p.city,
    state: p.state,
  })),
)}

Return ONLY a JSON array of objects: [{ "id": "...", "explanation": "..." }]
`.trim();

      const result = await this.explainerModel.generateContent(prompt);
      const text = result.response
        .text()
        .trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const explanations = JSON.parse(text) as Array<{
        id: string;
        explanation: string;
      }>;

      const explanationMap = new Map(
        explanations.map((e) => [e.id, e.explanation]),
      );

      return providers.map((p) => ({
        ...p,
        explanation: explanationMap.get(p.userProfileId) ?? undefined,
      }));
    } catch (err) {
      this.logger.warn(
        `Gemini explanation generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Return without explanations — never fail the search
      return providers;
    }
  }

  // ─── Private: Shape mapper ────────────────────────────────────────────────

  private toProviderShape(
    identity: Awaited<ReturnType<typeof this.queryIdentities>>[number],
  ): RankableProvider {
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
      pricing: identity.pricing as Record<string, unknown> | null,
      availability: identity.availability as Record<string, unknown> | null,
    };
  }

  // ─── Private: Cache key ───────────────────────────────────────────────────

  buildSearchCacheKey(
    query: string,
    latitude?: number,
    longitude?: number,
  ): string {
    const raw = `${query}|${latitude ?? ''}|${longitude ?? ''}`;
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return `search:${hash}`;
  }
}
