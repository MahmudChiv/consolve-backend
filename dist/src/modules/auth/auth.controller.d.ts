import type { Request, Response } from 'express';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto, res: Response): Promise<{
        message: string;
    }>;
    verifyOtp(dto: VerifyOtpDto, user: JwtPayload, req: Request, res: Response): Promise<{
        message: string;
    }>;
    resendOtp(user: JwtPayload): Promise<{
        message: string;
    }>;
    refresh(req: Request, res: Response): Promise<{
        message: string;
    }>;
    login(dto: LoginDto, res: Response): Promise<{
        message: string;
    }>;
    logout(user: JwtPayload, req: Request, res: Response): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto, res: Response): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto, user: JwtPayload, req: Request, res: Response): Promise<{
        message: string;
    }>;
}
