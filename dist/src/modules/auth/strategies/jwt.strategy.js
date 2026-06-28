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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const redis_service_1 = require("../../common/redis/redis.service");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'jwt') {
    configService;
    prismaService;
    redisService;
    constructor(configService, prismaService, redisService) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromExtractors([
                (req) => req?.cookies?.['access_token'] ?? null,
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get('jwt.accessSecret'),
            passReqToCallback: true,
        });
        this.configService = configService;
        this.prismaService = prismaService;
        this.redisService = redisService;
    }
    async validate(req, payload) {
        const token = req?.cookies?.['access_token'];
        if (!token) {
            throw new common_1.UnauthorizedException('Missing access token');
        }
        const blacklisted = await this.redisService.isBlacklisted(token);
        if (blacklisted) {
            throw new common_1.UnauthorizedException('Token has been revoked');
        }
        const user = await this.prismaService.user.findFirst({
            where: { id: payload.sub, deletedAt: null },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found or account deleted');
        }
        return payload;
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map