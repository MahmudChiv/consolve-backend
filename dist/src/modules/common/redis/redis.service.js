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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    configService;
    client;
    logger = new common_1.Logger(RedisService_1.name);
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        const redisUrl = this.configService.get('redis.url');
        this.client = redisUrl
            ? new ioredis_1.default(redisUrl, { lazyConnect: true })
            : new ioredis_1.default({
                host: this.configService.get('redis.host'),
                port: this.configService.get('redis.port'),
                password: this.configService.get('redis.password') || undefined,
                lazyConnect: true,
            });
        this.client.on('connect', () => this.logger.log('Redis connection established'));
        this.client.on('error', (err) => this.logger.error('Redis error', err));
    }
    async onModuleDestroy() {
        await this.client.quit();
        this.logger.log('Redis connection closed');
    }
    getClient() {
        return this.client;
    }
    async set(key, value, ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
    }
    async get(key) {
        return this.client.get(key);
    }
    async del(key) {
        await this.client.del(key);
    }
    async blacklist(token, ttlSeconds) {
        await this.client.set(`blacklist:${token}`, '1', 'EX', ttlSeconds);
    }
    async isBlacklisted(token) {
        const result = await this.client.exists(`blacklist:${token}`);
        return result === 1;
    }
    async cacheAccessToken(userId, token, ttlSeconds) {
        await this.set(`access:${userId}`, token, ttlSeconds);
    }
    async getCachedAccessToken(userId) {
        return this.get(`access:${userId}`);
    }
    async deleteCachedAccessToken(userId) {
        await this.del(`access:${userId}`);
    }
    async ping() {
        return this.client.ping();
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map