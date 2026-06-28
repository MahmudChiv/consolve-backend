import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private client;
    private readonly logger;
    constructor(configService: ConfigService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    getClient(): Redis;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<void>;
    blacklist(token: string, ttlSeconds: number): Promise<void>;
    isBlacklisted(token: string): Promise<boolean>;
    cacheAccessToken(userId: string, token: string, ttlSeconds: number): Promise<void>;
    getCachedAccessToken(userId: string): Promise<string | null>;
    deleteCachedAccessToken(userId: string): Promise<void>;
    ping(): Promise<string>;
}
