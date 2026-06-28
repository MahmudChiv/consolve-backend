import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Response } from 'express';
export declare class AuthService {
    private readonly prismaService;
    private readonly redisService;
    private readonly jwtService;
    private readonly configService;
    private readonly logger;
    private readonly twilioClient;
    constructor(prismaService: PrismaService, redisService: RedisService, jwtService: JwtService, configService: ConfigService);
    private generateOtp;
    private getOtpExpiry;
    private signAccessToken;
    private setAccessCookie;
    private setRefreshCookie;
    private clearAuthCookies;
    private sendOtp;
    private blacklistOldAccessToken;
    register(dto: RegisterDto, res: Response): Promise<{
        message: string;
    }>;
    verifyOtp(userId: string, dto: VerifyOtpDto, oldToken: string | undefined, res: Response): Promise<{
        message: string;
    }>;
    private issueFullAuthTokens;
    resendOtp(userId: string): Promise<{
        message: string;
    }>;
    refresh(userId: string, incomingRefreshToken: string, oldAccessToken: string | undefined, res: Response): Promise<{
        message: string;
    }>;
    cleanupExpiredUnverifiedUsers(): Promise<void>;
    login(dto: LoginDto, res: Response): Promise<{
        message: string;
    }>;
    logout(userId: string, accessToken: string | undefined, res: Response): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto, res: Response): Promise<{
        message: string;
    }>;
    resetPassword(userId: string, dto: ResetPasswordDto, oldToken: string | undefined, res: Response): Promise<{
        message: string;
    }>;
}
