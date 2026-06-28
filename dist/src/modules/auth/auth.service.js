"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const schedule_1 = require("@nestjs/schedule");
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = require("crypto");
const twilio_1 = __importDefault(require("twilio"));
const prisma_service_1 = require("../common/prisma/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
const BCRYPT_ROUNDS = 12;
let AuthService = AuthService_1 = class AuthService {
    prismaService;
    redisService;
    jwtService;
    configService;
    logger = new common_1.Logger(AuthService_1.name);
    twilioClient;
    constructor(prismaService, redisService, jwtService, configService) {
        this.prismaService = prismaService;
        this.redisService = redisService;
        this.jwtService = jwtService;
        this.configService = configService;
        const accountSid = this.configService.get('twilio.accountSid');
        const authToken = this.configService.get('twilio.authToken');
        if (accountSid && accountSid.startsWith('AC') && authToken) {
            this.twilioClient = (0, twilio_1.default)(accountSid, authToken);
        }
        else {
            this.logger.warn('Twilio credentials are not set or are invalid (accountSid must start with "AC"). SMS OTP delivery will be mocked/logged to console.');
            this.twilioClient = null;
        }
    }
    generateOtp() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    getOtpExpiry() {
        const seconds = this.configService.get('otp.expirySeconds') ?? 600;
        return new Date(Date.now() + seconds * 1000);
    }
    signAccessToken(userId, phoneNumber) {
        return this.jwtService.sign({ sub: userId, phoneNumber }, {
            secret: this.configService.get('jwt.accessSecret'),
            expiresIn: this.configService.get('jwt.accessExpiry') ?? 900,
        });
    }
    setAccessCookie(res, token) {
        const maxAge = (this.configService.get('jwt.accessExpiry') ?? 900) * 1000;
        res.cookie('access_token', token, {
            httpOnly: true,
            secure: this.configService.get('nodeEnv') === 'production',
            sameSite: 'strict',
            maxAge,
        });
    }
    setRefreshCookie(res, token) {
        const maxAge = (this.configService.get('jwt.refreshExpiry') ?? 604800) * 1000;
        res.cookie('refresh_token', token, {
            httpOnly: true,
            secure: this.configService.get('nodeEnv') === 'production',
            sameSite: 'strict',
            maxAge,
        });
    }
    clearAuthCookies(res) {
        const cookieOpts = {
            httpOnly: true,
            secure: this.configService.get('nodeEnv') === 'production',
            sameSite: 'strict',
        };
        res.clearCookie('access_token', cookieOpts);
        res.clearCookie('refresh_token', cookieOpts);
    }
    async sendOtp(phoneNumber, otp) {
        try {
            if (this.twilioClient) {
                await this.twilioClient.messages.create({
                    body: `Your Consolve verification code is: ${otp}. It expires in 10 minutes.`,
                    from: this.configService.get('twilio.phoneNumber'),
                    to: phoneNumber,
                });
                this.logger.log(`OTP sent to ${phoneNumber}`);
            }
            else {
                this.logger.warn(`[MOCKED SMS] OTP for ${phoneNumber} is: ${otp}`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to send OTP via Twilio API. Falling back to console logging. Error: ${err.message}`);
            this.logger.warn(`[MOCKED SMS FALLBACK] OTP for ${phoneNumber} is: ${otp}`);
        }
    }
    async blacklistOldAccessToken(userId, oldToken) {
        if (!oldToken)
            return;
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.blacklist(oldToken, accessExpiry);
        await this.redisService.deleteCachedAccessToken(userId);
    }
    async register(dto, res) {
        const { phoneNumber, password } = dto;
        const existing = await this.prismaService.user.findUnique({
            where: { phoneNumber },
        });
        if (existing) {
            if (!existing.deletedAt) {
                throw new common_1.ConflictException('Phone number already registered');
            }
            await this.prismaService.user.update({
                where: { id: existing.id },
                data: { deletedAt: null },
            });
        }
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const otp = this.generateOtp();
        const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
        const otpExpiry = this.getOtpExpiry();
        const user = await this.prismaService.user.upsert({
            where: { phoneNumber },
            update: {
                hashedPassword,
                hashedOtp,
                otpExpiry,
                deletedAt: null,
                isVerified: false,
                refreshToken: null,
            },
            create: {
                phoneNumber,
                hashedPassword,
                hashedOtp,
                otpExpiry,
            },
        });
        await this.sendOtp(phoneNumber, otp);
        const accessToken = this.signAccessToken(user.id, user.phoneNumber);
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);
        this.setAccessCookie(res, accessToken);
        return { message: 'OTP sent to your phone number' };
    }
    async verifyOtp(userId, dto, oldToken, res) {
        const user = await this.prismaService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.otpExpiry || user.otpExpiry < new Date()) {
            throw new common_1.BadRequestException('OTP has expired. Please request a new one.');
        }
        if (!user.hashedOtp) {
            throw new common_1.BadRequestException('No OTP found. Please request a new one.');
        }
        const isValid = await bcrypt.compare(dto.otp, user.hashedOtp);
        if (!isValid) {
            throw new common_1.BadRequestException('Invalid OTP');
        }
        await this.blacklistOldAccessToken(userId, oldToken);
        await this.issueFullAuthTokens(user.id, user.phoneNumber, res);
        return { message: 'Phone number verified successfully' };
    }
    async issueFullAuthTokens(userId, phoneNumber, res) {
        const newAccessToken = this.signAccessToken(userId, phoneNumber);
        const refreshToken = (0, crypto_1.randomBytes)(40).toString('hex');
        const hashedRefreshToken = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
        await this.prismaService.user.update({
            where: { id: userId },
            data: {
                isVerified: true,
                hashedOtp: null,
                otpExpiry: null,
                refreshToken: hashedRefreshToken,
            },
        });
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.cacheAccessToken(userId, newAccessToken, accessExpiry);
        this.setAccessCookie(res, newAccessToken);
        this.setRefreshCookie(res, refreshToken);
    }
    async resendOtp(userId) {
        const user = await this.prismaService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.isVerified) {
            throw new common_1.BadRequestException('Account is already verified');
        }
        const otp = this.generateOtp();
        const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
        const otpExpiry = this.getOtpExpiry();
        await this.prismaService.user.update({
            where: { id: user.id },
            data: { hashedOtp, otpExpiry },
        });
        await this.sendOtp(user.phoneNumber, otp);
        return { message: 'OTP resent to your phone number' };
    }
    async refresh(userId, incomingRefreshToken, oldAccessToken, res) {
        const user = await this.prismaService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });
        if (!user || !user.refreshToken) {
            throw new common_1.ForbiddenException('Access denied');
        }
        const isRefreshValid = await bcrypt.compare(incomingRefreshToken, user.refreshToken);
        if (!isRefreshValid) {
            throw new common_1.ForbiddenException('Invalid refresh token');
        }
        await this.blacklistOldAccessToken(userId, oldAccessToken);
        const newAccessToken = this.signAccessToken(user.id, user.phoneNumber);
        const newRefreshToken = (0, crypto_1.randomBytes)(40).toString('hex');
        const hashedRefreshToken = await bcrypt.hash(newRefreshToken, BCRYPT_ROUNDS);
        await this.prismaService.user.update({
            where: { id: user.id },
            data: { refreshToken: hashedRefreshToken },
        });
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.cacheAccessToken(user.id, newAccessToken, accessExpiry);
        this.setAccessCookie(res, newAccessToken);
        this.setRefreshCookie(res, newRefreshToken);
        return { message: 'Tokens refreshed successfully' };
    }
    async cleanupExpiredUnverifiedUsers() {
        const accessWindowMs = (this.configService.get('jwt.accessExpiry') ?? 900) * 1000;
        const cutoff = new Date(Date.now() - accessWindowMs);
        const result = await this.prismaService.user.updateMany({
            where: {
                isVerified: false,
                otpExpiry: { lt: new Date() },
                deletedAt: null,
                createdAt: { lt: cutoff },
            },
            data: { deletedAt: new Date() },
        });
        if (result.count > 0) {
            this.logger.log(`Soft-deleted ${result.count} expired unverified user account(s)`);
        }
    }
    async login(dto, res) {
        const { phoneNumber, password } = dto;
        const user = await this.prismaService.user.findFirst({
            where: { phoneNumber, deletedAt: null },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid phone number or password');
        }
        if (!user.isVerified) {
            throw new common_1.UnauthorizedException('Account is not verified. Please register again.');
        }
        const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid phone number or password');
        }
        if (this.configService.get('nodeEnv') === 'development') {
            await this.issueFullAuthTokens(user.id, user.phoneNumber, res);
            return { message: 'Login successful (development bypass)' };
        }
        const otp = this.generateOtp();
        const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
        const otpExpiry = this.getOtpExpiry();
        await this.prismaService.user.update({
            where: { id: user.id },
            data: { hashedOtp, otpExpiry },
        });
        await this.sendOtp(phoneNumber, otp);
        const accessToken = this.signAccessToken(user.id, user.phoneNumber);
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);
        this.setAccessCookie(res, accessToken);
        return { message: 'OTP sent to your phone number' };
    }
    async logout(userId, accessToken, res) {
        await this.blacklistOldAccessToken(userId, accessToken);
        await this.prismaService.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });
        this.clearAuthCookies(res);
        this.logger.log(`User ${userId} logged out`);
        return { message: 'Logged out successfully' };
    }
    async forgotPassword(dto, res) {
        const user = await this.prismaService.user.findFirst({
            where: { phoneNumber: dto.phoneNumber, deletedAt: null },
        });
        if (!user || !user.isVerified) {
            return {
                message: 'If an account with that number exists, an OTP has been sent.',
            };
        }
        const otp = this.generateOtp();
        const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
        const otpExpiry = this.getOtpExpiry();
        await this.prismaService.user.update({
            where: { id: user.id },
            data: { hashedOtp, otpExpiry },
        });
        await this.sendOtp(dto.phoneNumber, otp);
        const accessToken = this.signAccessToken(user.id, user.phoneNumber);
        const accessExpiry = this.configService.get('jwt.accessExpiry') ?? 900;
        await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);
        this.setAccessCookie(res, accessToken);
        return {
            message: 'If an account with that number exists, an OTP has been sent.',
        };
    }
    async resetPassword(userId, dto, oldToken, res) {
        const user = await this.prismaService.user.findFirst({
            where: { id: userId, deletedAt: null },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.otpExpiry || user.otpExpiry < new Date()) {
            throw new common_1.BadRequestException('OTP has expired. Please request a new one.');
        }
        if (!user.hashedOtp) {
            throw new common_1.BadRequestException('No OTP found. Please request a new one.');
        }
        const isOtpValid = await bcrypt.compare(dto.otp, user.hashedOtp);
        if (!isOtpValid) {
            throw new common_1.BadRequestException('Invalid OTP');
        }
        const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
        await this.prismaService.user.update({
            where: { id: user.id },
            data: {
                hashedPassword,
                hashedOtp: null,
                otpExpiry: null,
                refreshToken: null,
            },
        });
        await this.blacklistOldAccessToken(userId, oldToken);
        this.clearAuthCookies(res);
        this.logger.log(`Password reset for user ${userId}`);
        return { message: 'Password reset successfully. Please log in again.' };
    }
};
exports.AuthService = AuthService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AuthService.prototype, "cleanupExpiredUnverifiedUsers", null);
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map