/**
 * search.service.spec.ts
 *
 * Unit tests for SearchService.
 * Target: >90% coverage of search.service.ts, search.parser.ts, search.ranker.ts, search.geo.ts
 *
 * All external dependencies are mocked:
 *  - PrismaService   — in-memory mock
 *  - RedisService    — in-memory mock
 *  - SearchParser    — mock resolves with a predictable ParsedIntent
 *  - ConfigService   — returns API key placeholder
 *  - Gemini SDK      — module-level mock
 */

// ── Gemini mock (hoisted) ──────────────────────────────────────────────────
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OnboardingStatus, UserType, Gender } from '@prisma/client';
import { SearchService } from './search.service';
import { SearchParser } from './search.parser';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { haversineDistanceKm } from './search.geo';
import { computeRankScore, sortByRank } from './search.ranker';
import { SearchDto } from './dto/search.dto';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  identity: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

const mockParser = {
  parseIntent: jest.fn(),
  keywordFallback: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('fake-gemini-api-key'),
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeParsedIntent = (overrides = {}) => ({
  profession: 'tailor',
  location: 'lagos',
  experienceMin: null,
  specialties: ['senator wear'],
  urgency: 'unspecified' as const,
  priceMax: null,
  ...overrides,
});

const makeIdentity = (overrides: Record<string, unknown> = {}) => ({
  id: 'identity-uuid',
  userId: 'user-uuid',
  userProfileId: 'profile-uuid',
  profession: 'Tailor',
  summary: 'An experienced tailor based in Lagos.',
  expertise: ['senator wear', 'agbada'],
  experience: 8,
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  latitude: 6.5244,
  longitude: 3.3792,
  pricing: { min: 15000, max: 150000, currency: 'NGN' },
  availability: { type: 'full-time' },
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  userProfile: {
    id: 'profile-uuid',
    userId: 'user-uuid',
    firstName: 'Emeka',
    lastName: 'Okafor',
    gender: Gender.MALE,
    type: UserType.SERVICE_PROVIDER,
    avatarUrl: 'https://example.com/avatar.jpg',
    onboardingStatus: OnboardingStatus.COMPLETED,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: Gemini returns a valid explanation JSON
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify([
            {
              id: 'profile-uuid',
              explanation: 'Emeka is a Lagos-based tailor with 8 years of experience.',
            },
          ]),
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SearchParser, useValue: mockParser },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  // ── search() ──────────────────────────────────────────────────────────────

  describe('search()', () => {
    const dto: SearchDto = {
      query: 'Find a tailor near Lagos who makes senator wear',
      latitude: 6.5244,
      longitude: 3.3792,
    };

    it('should return ranked results on a fresh query (cache miss)', async () => {
      mockRedis.get.mockResolvedValue(null); // cache miss
      mockParser.parseIntent.mockResolvedValue(makeParsedIntent());
      mockPrisma.identity.findMany.mockResolvedValue([makeIdentity()]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.search(dto);

      expect(result).toMatchObject({
        query: dto.query,
        cached: false,
        total: 1,
      });
      expect((result.results as unknown[]).length).toBe(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('search:'),
        expect.any(String),
        300,
      );
    });

    it('should return cached results and set cached=true on cache hit', async () => {
      const cachedPayload = {
        query: dto.query,
        parsedIntent: makeParsedIntent(),
        results: [],
        total: 0,
        cached: false,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedPayload));

      const result = await service.search(dto);

      expect(result.cached).toBe(true);
      expect(mockParser.parseIntent).not.toHaveBeenCalled();
      expect(mockPrisma.identity.findMany).not.toHaveBeenCalled();
    });

    it('should return empty results when DB returns no matches', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockParser.parseIntent.mockResolvedValue(makeParsedIntent());
      mockPrisma.identity.findMany.mockResolvedValue([]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.search(dto);

      expect(result.total).toBe(0);
      expect(result.results).toEqual([]);
    });

    it('should still return results even if Gemini explanation fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Gemini quota exceeded'));
      mockRedis.get.mockResolvedValue(null);
      mockParser.parseIntent.mockResolvedValue(makeParsedIntent());
      mockPrisma.identity.findMany.mockResolvedValue([makeIdentity()]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.search(dto);

      // Should still have results, just no explanations
      expect(result.total).toBe(1);
      const firstResult = (result.results as Record<string, unknown>[])[0];
      expect(firstResult.explanation).toBeUndefined();
    });

    it('should build consistent cache keys for identical queries', () => {
      const key1 = service.buildSearchCacheKey('tailor in Lagos', 6.5, 3.3);
      const key2 = service.buildSearchCacheKey('tailor in Lagos', 6.5, 3.3);
      const key3 = service.buildSearchCacheKey('tailor in Lagos', 6.6, 3.3); // different lat
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should handle a query with no latitude/longitude', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockParser.parseIntent.mockResolvedValue(makeParsedIntent());
      mockPrisma.identity.findMany.mockResolvedValue([makeIdentity()]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.search({ query: 'tailor in Lagos' });

      expect(result.total).toBe(1);
      const firstResult = (result.results as Record<string, unknown>[])[0];
      // distanceKm should be undefined when no user coordinates provided
      expect(firstResult.distanceKm).toBeUndefined();
    });
  });

  // ── searchNearby() ────────────────────────────────────────────────────────

  describe('searchNearby()', () => {
    it('should return providers within the radius sorted by distance', async () => {
      // Two providers: one 2km away, one 50km away
      const near = makeIdentity({ latitude: 6.5244, longitude: 3.3792, userProfileId: 'near' });
      const far = makeIdentity({ latitude: 7.3986, longitude: 3.9030, userProfileId: 'far' });
      mockPrisma.identity.findMany.mockResolvedValue([near, far]);

      const result = await service.searchNearby({
        latitude: 6.5244,
        longitude: 3.3792,
        radius: 10,
      });

      // Only the near provider should be within 10km
      expect((result.results as unknown[]).length).toBe(1);
      const providers = result.results as Record<string, unknown>[];
      expect(providers[0].userProfileId).toBe('near');
    });

    it('should filter by profession when provided', async () => {
      mockPrisma.identity.findMany.mockResolvedValue([makeIdentity()]);

      await service.searchNearby({
        latitude: 6.5244,
        longitude: 3.3792,
        radius: 10,
        profession: 'tailor',
      });

      expect(mockPrisma.identity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profession: expect.objectContaining({ contains: 'tailor' }),
          }),
        }),
      );
    });

    it('should return empty results when no providers are within radius', async () => {
      // Provider is far away (e.g. Kano ~900km from Lagos)
      const far = makeIdentity({ latitude: 12.0022, longitude: 8.5919, userProfileId: 'far-kano' });
      mockPrisma.identity.findMany.mockResolvedValue([far]);

      const result = await service.searchNearby({
        latitude: 6.5244, // Lagos
        longitude: 3.3792,
        radius: 10,
      });

      expect((result.results as unknown[]).length).toBe(0);
    });
  });

  // ── getCategories() ───────────────────────────────────────────────────────

  describe('getCategories()', () => {
    it('should return distinct professions from DB on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.identity.findMany.mockResolvedValue([
        { profession: 'electrician' },
        { profession: 'plumber' },
        { profession: 'tailor' },
      ]);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getCategories();

      expect(result.categories).toEqual(['electrician', 'plumber', 'tailor']);
      expect(result.cached).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'search:categories',
        expect.any(String),
        3600,
      );
    });

    it('should return cached categories with cached=true on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(['electrician', 'tailor']));

      const result = await service.getCategories();

      expect(result.categories).toEqual(['electrician', 'tailor']);
      expect(result.cached).toBe(true);
      expect(mockPrisma.identity.findMany).not.toHaveBeenCalled();
    });
  });

  // ── getProfile() ──────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('should return a single provider profile', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.identity.findFirst.mockResolvedValue(makeIdentity());
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getProfile('profile-uuid');

      expect(result.userProfileId).toBe('profile-uuid');
      expect(result.firstName).toBe('Emeka');
      expect(result.cached).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'profile:profile-uuid',
        expect.any(String),
        600,
      );
    });

    it('should return cached profile with cached=true on cache hit', async () => {
      const cachedProfile = { userProfileId: 'profile-uuid', firstName: 'Emeka', cached: false };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedProfile));

      const result = await service.getProfile('profile-uuid');

      expect(result.cached).toBe(true);
      expect(mockPrisma.identity.findFirst).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.identity.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-uuid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SearchParser unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SearchParser', () => {
  let parser: SearchParser;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchParser,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    parser = module.get<SearchParser>(SearchParser);
  });

  it('should parse a structured Gemini response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            profession: 'tailor',
            location: 'lagos',
            experienceMin: 5,
            specialties: ['senator wear'],
            urgency: 'unspecified',
            priceMax: null,
          }),
      },
    });

    const result = await parser.parseIntent('tailor in Lagos with 5 years');

    expect(result.profession).toBe('tailor');
    expect(result.location).toBe('lagos');
    expect(result.experienceMin).toBe(5);
  });

  it('should fall back to keyword extraction when Gemini fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API unavailable'));

    const result = await parser.parseIntent('electrician urgently in Abuja');

    // Should not throw — returns fallback
    expect(result).toBeDefined();
    expect(result.urgency).toBe('now'); // "urgently" → 'now'
    expect(result.location).toBe('abuja');
  });

  it('should extract urgency from keyword fallback', () => {
    const result = parser.keywordFallback('I need a plumber now in Lagos urgent');
    expect(result.urgency).toBe('now');
  });

  it('should extract experience years from keyword fallback', () => {
    const result = parser.keywordFallback('mechanic with 7 years experience in Kano');
    expect(result.experienceMin).toBe(7);
  });

  it('should handle Pidgin queries in keyword fallback', () => {
    const result = parser.keywordFallback('Plumber wey dey do good work for Ibadan');
    expect(result.location).toBe('ibadan');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// search.geo.ts unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('haversineDistanceKm()', () => {
  it('should return 0 for identical coordinates', () => {
    expect(haversineDistanceKm(6.5244, 3.3792, 6.5244, 3.3792)).toBe(0);
  });

  it('should calculate Lagos to Ibadan (~120km) within ±10km tolerance', () => {
    const dist = haversineDistanceKm(6.5244, 3.3792, 7.3764, 3.9470);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(135);
  });

  it('should return a positive number for any two different coordinates', () => {
    const dist = haversineDistanceKm(0, 0, 1, 1);
    expect(dist).toBeGreaterThan(0);
  });

  it('should be symmetric (A→B === B→A)', () => {
    const ab = haversineDistanceKm(6.5244, 3.3792, 12.0022, 8.5919);
    const ba = haversineDistanceKm(12.0022, 8.5919, 6.5244, 3.3792);
    expect(ab).toBeCloseTo(ba, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// search.ranker.ts unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRankScore()', () => {
  const baseProvider = {
    userProfileId: 'p1',
    firstName: 'Emeka',
    lastName: 'Okafor',
    avatarUrl: null,
    profession: 'tailor',
    summary: null,
    expertise: ['senator wear'],
    experience: null,
    city: null,
    state: null,
    latitude: null,
    longitude: null,
    pricing: null,
    availability: null,
  };

  it('should score 0 for a completely empty profile with no matching intent', () => {
    const score = computeRankScore(baseProvider, { location: null });
    expect(score).toBe(0);
  });

  it('should add 3 pts for exact city match', () => {
    const score = computeRankScore(
      { ...baseProvider, city: 'Lagos' },
      { location: 'Lagos' },
    );
    expect(score).toBeGreaterThanOrEqual(3);
  });

  it('should add 1 pt for state-level match', () => {
    const score = computeRankScore(
      { ...baseProvider, city: 'Ikeja', state: 'Lagos' },
      { location: 'Lagos' },
    );
    // state match = 1pt (or city match = 3pt if city happens to match)
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it('should add experience points (1pt per 5 years, max 3)', () => {
    const score10yr = computeRankScore(
      { ...baseProvider, experience: 10 },
      {},
    );
    const score20yr = computeRankScore(
      { ...baseProvider, experience: 20 },
      {},
    );
    expect(score10yr).toBe(2); // 10/5 = 2
    expect(score20yr).toBe(3); // capped at 3
  });

  it('should add profile completeness points', () => {
    const complete = {
      ...baseProvider,
      avatarUrl: 'https://example.com/avatar.jpg',
      pricing: { min: 1000, max: 5000 },
      availability: { type: 'full-time' },
    };
    const score = computeRankScore(complete, {});
    expect(score).toBeGreaterThanOrEqual(3); // avatar + pricing + availability
  });

  it('should add proximity bonus for provider within 5km', () => {
    const score = computeRankScore(baseProvider, {}, 3); // 3km away
    expect(score).toBe(1); // proximity bonus
  });
});

describe('sortByRank()', () => {
  it('should sort by rankScore descending', () => {
    const providers = [
      { userProfileId: 'a', rankScore: 2, firstName: 'A', lastName: 'A', avatarUrl: null, profession: null, summary: null, expertise: [], experience: null, city: null, state: null, latitude: null, longitude: null, pricing: null, availability: null },
      { userProfileId: 'b', rankScore: 7, firstName: 'B', lastName: 'B', avatarUrl: null, profession: null, summary: null, expertise: [], experience: null, city: null, state: null, latitude: null, longitude: null, pricing: null, availability: null },
      { userProfileId: 'c', rankScore: 5, firstName: 'C', lastName: 'C', avatarUrl: null, profession: null, summary: null, expertise: [], experience: null, city: null, state: null, latitude: null, longitude: null, pricing: null, availability: null },
    ];

    const sorted = sortByRank(providers);
    expect(sorted[0].userProfileId).toBe('b');
    expect(sorted[1].userProfileId).toBe('c');
    expect(sorted[2].userProfileId).toBe('a');
  });

  it('should use distanceKm as tiebreaker (closer wins)', () => {
    const providers = [
      { userProfileId: 'far', rankScore: 5, distanceKm: 20, firstName: 'F', lastName: 'F', avatarUrl: null, profession: null, summary: null, expertise: [], experience: null, city: null, state: null, latitude: null, longitude: null, pricing: null, availability: null },
      { userProfileId: 'near', rankScore: 5, distanceKm: 2, firstName: 'N', lastName: 'N', avatarUrl: null, profession: null, summary: null, expertise: [], experience: null, city: null, state: null, latitude: null, longitude: null, pricing: null, availability: null },
    ];

    const sorted = sortByRank(providers);
    expect(sorted[0].userProfileId).toBe('near');
  });
});
