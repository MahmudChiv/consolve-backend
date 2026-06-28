import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
export declare class HealthController {
    private readonly health;
    private readonly prismaService;
    private readonly redisService;
    private readonly redisIndicator;
    constructor(health: HealthCheckService, prismaService: PrismaService, redisService: RedisService);
    check(): Promise<HealthCheckResult>;
}
