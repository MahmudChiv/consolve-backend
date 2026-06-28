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
var UserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../common/prisma/prisma.service");
let UserService = UserService_1 = class UserService {
    prismaService;
    logger = new common_1.Logger(UserService_1.name);
    constructor(prismaService) {
        this.prismaService = prismaService;
    }
    async createProfile(userId, dto) {
        const user = await this.prismaService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (!user.isVerified) {
            throw new common_1.BadRequestException('Account is not verified. Please verify your phone number first.');
        }
        const { firstName, lastName, gender, types, avatarUrl } = dto;
        const createdProfiles = [];
        for (const type of types) {
            const existing = await this.prismaService.userProfile.findUnique({
                where: { userId_type: { userId, type } },
            });
            if (existing) {
                this.logger.warn(`UserProfile of type ${type} already exists for user ${userId} — skipping creation`);
                createdProfiles.push(existing);
                continue;
            }
            const profile = await this.prismaService.userProfile.create({
                data: {
                    userId,
                    firstName,
                    lastName,
                    gender,
                    type,
                    ...(avatarUrl && { avatarUrl }),
                },
            });
            createdProfiles.push(profile);
            this.logger.log(`Created UserProfile type=${type} for user=${userId}`);
        }
        return createdProfiles;
    }
    async getProfiles(userId) {
        return this.prismaService.userProfile.findMany({
            where: { userId },
        });
    }
};
exports.UserService = UserService;
exports.UserService = UserService = UserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserService);
//# sourceMappingURL=user.service.js.map