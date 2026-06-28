/**
 * search.controller.ts
 *
 * HTTP layer for the Search and Matchmaking module.
 *
 * Routes:
 *   POST   /api/v1/search              — AI-powered natural language search
 *   GET    /api/v1/search/nearby       — geo-proximity search
 *   GET    /api/v1/search/categories   — distinct profession list (cached 1hr)
 *   GET    /api/v1/search/:profileId   — single provider public profile
 *
 * All routes: JwtAuthGuard + TokenBlacklistGuard
 * Rate limits: 30 req/min for search, 60 req/min for read-only endpoints
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { SearchDto } from './dto/search.dto';
import { NearbySearchDto } from './dto/nearby-search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, TokenBlacklistGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // ─── POST /search ──────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
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
  })
  @ApiBody({ type: SearchDto })
  @ApiResponse({
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
              explanation:
                'Emeka matches because he is a Lagos-based tailor with 8 years specialising in senator wear.',
              distanceKm: 2.3,
            },
          ],
          total: 1,
          cached: false,
        },
        timestamp: '2026-06-28T09:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async search(@Body() dto: SearchDto): Promise<Record<string, unknown>> {
    const data = await this.searchService.search(dto);
    return {
      success: true,
      message: 'Search results retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /search/nearby ────────────────────────────────────────────────────

  @Get('nearby')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Find providers within a geographic radius',
    description:
      'Returns providers within `radius` km of the given coordinates, sorted by distance ascending. ' +
      'Optionally filter by profession. Distance is calculated using the Haversine formula.',
  })
  @ApiQuery({ name: 'latitude', required: true, type: Number, example: 6.5244 })
  @ApiQuery({ name: 'longitude', required: true, type: Number, example: 3.3792 })
  @ApiQuery({
    name: 'radius',
    required: false,
    type: Number,
    example: 10,
    description: 'Radius in km (default 10, max 100)',
  })
  @ApiQuery({
    name: 'profession',
    required: false,
    type: String,
    example: 'tailor',
  })
  @ApiResponse({ status: 200, description: 'Distance-sorted list of nearby providers' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async nearby(
    @Query() dto: NearbySearchDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.searchService.searchNearby(dto);
    return {
      success: true,
      message: 'Nearby providers retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /search/categories ────────────────────────────────────────────────

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get all available profession categories',
    description:
      'Returns a distinct, alphabetically sorted list of professions in the Identity table. ' +
      'Result is cached in Redis for 1 hour.',
  })
  @ApiResponse({
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
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCategories(): Promise<Record<string, unknown>> {
    const data = await this.searchService.getCategories();
    return {
      success: true,
      message: 'Categories retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /search/:profileId ────────────────────────────────────────────────

  @Get(':profileId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get a single provider public profile',
    description:
      'Returns the merged Identity + UserProfile for a specific provider. ' +
      'Cached in Redis for 10 minutes.',
  })
  @ApiParam({
    name: 'profileId',
    description: 'The UserProfile UUID of the provider',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiResponse({ status: 200, description: 'Provider public profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Provider profile not found' })
  async getProfile(
    @Param('profileId') profileId: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.searchService.getProfile(profileId);
    return {
      success: true,
      message: 'Provider profile retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
