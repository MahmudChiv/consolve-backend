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

@ApiTags('Auth')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min per IP
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   *
   * Public endpoint (no JWT guard). The user provides their phone number
   * and a strong password. On success:
   *  - A 6-digit OTP is sent to the phone via Twilio
   *  - An access token is set in the `access_token` httpOnly cookie
   *    (used to authenticate the subsequent /verifyOtp call)
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register with phone number and password',
    description:
      'Creates a new user account, sends a 6-digit OTP via SMS, and issues an access token cookie.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 409, description: 'Phone number already registered' })
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
   * Generates a new OTP (invalidating the previous one) and sends it via SMS.
   * Does not change the access token.
   */
  @Post('resendOtp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Resend OTP',
    description: "Generates a new OTP and sends it to the user's phone number.",
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
}
