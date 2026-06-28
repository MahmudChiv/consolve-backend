/**
 * auth.controller.ts
 *
 * HTTP layer for the authentication module.
 *
 * All routes are throttled at 5 requests per minute per IP to protect
 * against OTP brute-force and credential-stuffing attacks.
 *
 * Cookie strategy:
 *  - access_token  : httpOnly, 15 min, set on register + verifyOtp + refresh
 *  - refresh_token : httpOnly, 7 days, set on verifyOtp + refresh
 *
 * The controller does not contain business logic — it delegates everything
 * to AuthService and only handles HTTP concerns (cookie reading, response shaping).
 *
 * Note on imports: Request/Response from express are imported as 'import type'
 * because isolatedModules + emitDecoratorMetadata requires types used in
 * decorated parameters to be namespace or type imports.
 */
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min per IP
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   *
   * Public endpoint (no JWT guard). The user provides their email
   * and a strong password. On success:
   *  - A 6-digit OTP is sent to the email via Nodemailer
   *  - An access token is set in the `access_token` httpOnly cookie
   *    (used to authenticate the subsequent /verifyOtp call)
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register with email and password',
    description:
      'Creates a new user account, sends a 6-digit OTP via email, and issues an access token cookie.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  /**
   * POST /auth/verifyOtp
   *
   * Protected by JwtAuthGuard + TokenBlacklistGuard.
   * The user's identity is retrieved from the access token cookie.
   *
   * On success:
   *  - Account is marked as verified
   *  - Old access token is blacklisted
   *  - New access token + refresh token are issued as httpOnly cookies
   */
  @Post('verifyOtp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Verify OTP and complete authentication',
    description:
      'Verifies the 6-digit OTP, marks the account as verified, and rotates access + refresh tokens.',
  })
  @ApiResponse({ status: 200, description: 'Account verified, tokens issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // We pass the old token so AuthService can blacklist it during rotation
    const oldToken: string | undefined = req.cookies?.['access_token'];
    return this.authService.verifyOtp(user.sub, dto, oldToken, res);
  }

  /**
   * POST /auth/resendOtp
   *
   * Protected endpoint — the client must have the access token cookie from /register.
   * Generates a new OTP (invalidating the previous one) and sends it via email.
   * Does not change the access token.
   */
  @Post('resendOtp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Resend OTP',
    description: "Generates a new OTP and sends it to the user's email address.",
  })
  @ApiResponse({ status: 200, description: 'OTP resent' })
  @ApiResponse({ status: 400, description: 'Account already verified' })
  async resendOtp(@CurrentUser() user: JwtPayload) {
    return this.authService.resendOtp(user.sub);
  }

  /**
   * POST /auth/refresh
   *
   * No JwtAuthGuard here — the access token may have expired.
   * Instead, the refresh token cookie is validated by AuthService.
   *
   * The user's ID is read from:
   *  1. request.user.sub if a valid access token is still present
   *  2. A decoded (unverified) access token if it has expired
   *
   * On success: both access and refresh tokens are rotated.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Refresh access and refresh tokens',
    description:
      'Validates the refresh token from cookie and rotates both access and refresh tokens.',
  })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 403, description: 'Invalid refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken: string | undefined = req.cookies?.['refresh_token'];
    const oldAccessToken: string | undefined = req.cookies?.['access_token'];

    if (!refreshToken) {
      throw new ForbiddenException('No refresh token provided');
    }

    // Attempt to get userId from the Passport-validated user on the request,
    // or fall back to decoding the (possibly expired) access token
    let userId: string;
    try {
      const payload = (req as any)['user'] as JwtPayload | undefined;
      if (payload?.sub) {
        // Access token is still valid — use the already-validated payload
        userId = payload.sub;
      } else {
        // Access token has expired — decode without verification to get sub
        // (The refresh token itself will be validated by AuthService)
        const { JwtService } = await import('@nestjs/jwt');
        const jwtService = new JwtService({});
        const decoded = jwtService.decode(oldAccessToken ?? '') as JwtPayload;
        userId = decoded?.sub;
      }
    } catch {
      throw new ForbiddenException('Cannot identify user from token');
    }

    if (!userId) throw new ForbiddenException('Cannot identify user');

    return this.authService.refresh(userId, refreshToken, oldAccessToken, res);
  }

  /**
   * POST /auth/login
   *
   * Public endpoint. Validates credentials, and directly issues full auth tokens.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Validates credentials and directly issues authentication cookies.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  /**
   * POST /auth/logout
   *
   * Protected endpoint. Revokes the access token (blacklists it in Redis),
   * clears the refresh token in DB, and clears all cookies.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Logout user and revoke tokens',
    description:
      'Blacklists the current access token, clears the refresh token, and deletes auth cookies.',
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const accessToken: string | undefined = req.cookies?.['access_token'];
    return this.authService.logout(user.sub, accessToken, res);
  }

  /**
   * POST /auth/forgotPassword
   *
   * Public endpoint. Initiates password reset by sending an OTP
   * and setting a temporary access token cookie.
   */
  @Post('forgotPassword')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate password reset',
    description:
      'Sends a 6-digit OTP to the email address and sets a temporary access token cookie on success.',
  })
  @ApiResponse({
    status: 200,
    description: 'If an account exists, OTP has been sent.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.forgotPassword(dto, res);
  }

  /**
   * PATCH /auth/resetPassword
   *
   * Protected endpoint (requires the temporary access token from forgotPassword).
   * Verifies the OTP, hashes/updates the user password, and clears cookies.
   */
  @Patch('resetPassword')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Verify OTP and reset password',
    description:
      'Verifies OTP, updates password, blacklists the temporary access token, and clears auth cookies.',
  })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const oldToken: string | undefined = req.cookies?.['access_token'];
    return this.authService.resetPassword(user.sub, dto, oldToken, res);
  }
}
