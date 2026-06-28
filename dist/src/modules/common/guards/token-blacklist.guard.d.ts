import { CanActivate, ExecutionContext } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
export declare class TokenBlacklistGuard implements CanActivate {
    private readonly redisService;
    constructor(redisService: RedisService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
