import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SearchParser } from './search.parser';
import { SearchDto } from './dto/search.dto';
import { NearbySearchDto } from './dto/nearby-search.dto';
export declare class SearchService {
    private readonly prismaService;
    private readonly redisService;
    private readonly searchParser;
    private readonly configService;
    private readonly logger;
    private readonly explainerModel;
    constructor(prismaService: PrismaService, redisService: RedisService, searchParser: SearchParser, configService: ConfigService);
    search(dto: SearchDto): Promise<Record<string, unknown>>;
    searchNearby(dto: NearbySearchDto): Promise<Record<string, unknown>>;
    getCategories(): Promise<Record<string, unknown>>;
    getProfile(profileId: string): Promise<Record<string, unknown>>;
    private queryIdentities;
    private rankResults;
    private addExplanations;
    private toProviderShape;
    buildSearchCacheKey(query: string, latitude?: number, longitude?: number): string;
}
