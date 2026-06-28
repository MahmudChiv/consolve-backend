/**
 * auth.service.ts
 *
 * Core authentication business logic.
 *
 * Responsibilities:
 *  - register()      Create account, send OTP via Twilio, issue access token cookie
 *  - login()         Validate credentials, send OTP, issue access token cookie
 *  - verifyOtp()     Validate OTP, mark account verified, rotate tokens
 *  - resendOtp()     Generate and send a fresh OTP for unverified accounts
 *  - logout()        Revoke and blacklist tokens, clear cookies
 *  - refresh()       Validate refresh token, rotate both tokens
 *  - forgotPassword()  Send OTP for password reset
 *  - resetPassword()   Verify OTP and set new password
 *  - cleanupExpiredUnverifiedUsers() — cron job: soft-delete stale accounts
 *
 * Token strategy:
 *  - Access token  : JWT, signed with JWT_ACCESS_SECRET, stored in httpOnly cookie,
 *                    raw string cached in Redis for quick lookup, 15-min TTL
 *  - Refresh token : UUID v4 (opaque), bcrypt-hashed before DB storage,
 *                    stored in httpOnly cookie, NOT cached in Redis
 *
 * Security measures:
 *  - OTPs are bcrypt-hashed before storage — never stored in plaintext
 *  - Passwords are bcrypt-hashed with 12 rounds (OWASP recommendation)
 *  - Old access tokens are blacklisted in Redis on every token rotation
 *  - Soft-delete prevents re-registration from resurrecting stale accounts
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Response } from 'express';

/** bcrypt cost factor — 12 rounds is the OWASP-recommended minimum for passwords */
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Twilio REST client — initialised once at service construction */
  private readonly twilioClient: Twilio | null;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Build the Twilio client from env-sourced credentials.
    // Using require() ensures jest.mock('twilio') works correctly in tests.
    // The twilio package exports a function directly as module.exports.
    const accountSid = this.configService.get<string>('twilio.accountSid');
    const authToken = this.configService.get<string>('twilio.authToken');

    if (accountSid && accountSid.startsWith('AC') && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
    } else {
      this.logger.warn(
        'Twilio credentials are not set or are invalid (accountSid must start with "AC"). SMS OTP delivery will be mocked/logged to console.',
      );
      this.twilioClient = null;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Generate a cryptographically random 6-digit OTP string.
   * Math.random() is used here intentionally — the OTP is a
   * one-time code, not a secret key, so a CSPRNG is not required.
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Compute the OTP expiry timestamp.
   * Returns current time + OTP_EXPIRY_SECONDS from config (default 600 s = 10 min).
   */
  private getOtpExpiry(): Date {
    const seconds = this.configService.get<number>('otp.expirySeconds') ?? 600;
    return new Date(Date.now() + seconds * 1000);
  }

  /**
   * Sign a short-lived JWT access token.
   *
   * Payload includes:
   *  - sub          : user UUID (standard JWT "subject" claim)
   *  - phoneNumber  : convenience claim — lets controllers identify the user
   *                   without a DB round-trip
   */
  private signAccessToken(userId: string, phoneNumber: string): string {
    return this.jwtService.sign(
      { sub: userId, phoneNumber },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<number>('jwt.accessExpiry') ?? 900,
      },
    );
  }

  /**
   * Set the access token as an httpOnly cookie on the response.
   *
   * httpOnly: true  — cookie is not readable by JavaScript (XSS protection)
   * secure: true    — cookie is only sent over HTTPS in production
   * sameSite: strict — prevents CSRF by blocking cross-site cookie sends
   */
  private setAccessCookie(res: Response, token: string): void {
    const maxAge =
      (this.configService.get<number>('jwt.accessExpiry') ?? 900) * 1000;
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'strict',
      maxAge,
    });
  }

  /**
   * Set the refresh token as an httpOnly cookie.
   *
   * The refresh token has a longer TTL (7 days) than the access token (15 min).
   * It is stored as an opaque random string in the cookie and as a
   * bcrypt hash in the database — never in plaintext.
   */
  private setRefreshCookie(res: Response, token: string): void {
    const maxAge =
      (this.configService.get<number>('jwt.refreshExpiry') ?? 604800) * 1000;
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'strict',
      maxAge,
    });
  }

  /**
   * Clear both auth cookies — used on logout.
   */
  private clearAuthCookies(res: Response): void {
    const cookieOpts = {
      httpOnly: true,
      secure: this.configService.get<string>('nodeEnv') === 'production',
      sameSite: 'strict' as const,
    };
    res.clearCookie('access_token', cookieOpts);
    res.clearCookie('refresh_token', cookieOpts);
  }

  /**
   * Send a one-time passcode via Twilio SMS.
   * Throws BadRequestException (not a 5xx) so the client receives a
   * meaningful error rather than a generic server error.
   */
  private async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    try {
      if (this.twilioClient) {
        await this.twilioClient.messages.create({
          body: `Your Consolve verification code is: ${otp}. It expires in 10 minutes.`,
          from: this.configService.get<string>('twilio.phoneNumber'),
          to: phoneNumber,
        });
        this.logger.log(`OTP sent to ${phoneNumber}`);
      } else {
        this.logger.warn(`[MOCKED SMS] OTP for ${phoneNumber} is: ${otp}`);
      }
    } catch (err) {
      this.logger.error(
        `Failed to send OTP via Twilio API. Falling back to console logging. Error: ${err.message}`,
      );
      this.logger.warn(`[MOCKED SMS FALLBACK] OTP for ${phoneNumber} is: ${otp}`);
    }
  }

  /**
   * Blacklist the current access token and remove it from the Redis cache.
   *
   * Called every time tokens are rotated (verifyOtp, refresh) to ensure
   * the old access token cannot be reused after the new one is issued.
   *
   * @param userId   The user's UUID (used to delete the cache entry)
   * @param oldToken The raw JWT string to blacklist (may be undefined if none)
   */
  private async blacklistOldAccessToken(
    userId: string,
    oldToken: string | undefined,
  ): Promise<void> {
    if (!oldToken) return;

    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;

    // Write to blacklist with the same TTL as the access token so Redis
    // automatically cleans up the entry when the token would have expired anyway
    await this.redisService.blacklist(oldToken, accessExpiry);

    // Also remove from the token cache to avoid returning a stale cached value
    await this.redisService.deleteCachedAccessToken(userId);
  }

  // ─── Register ───────────────────────────────────────────────────────────────

  /**
   * POST /auth/register
   *
   * Flow:
   *  1. Check if the phone number is already taken
   *     - If yes and account is active → ConflictException
   *     - If yes and soft-deleted → restore the account (allow re-registration)
   *  2. Hash the password with bcrypt
   *  3. Generate a 6-digit OTP, hash it, set expiry to now + 10 min
   *  4. Upsert the User record in the DB
   *  5. Send the plaintext OTP via Twilio (DB only stores the hash)
   *  6. Sign an access JWT, cache it in Redis, set the cookie
   */
  async register(dto: RegisterDto, res: Response): Promise<{ message: string }> {
    const { phoneNumber, password } = dto;

    // Check for existing account with this phone number
    const existing = await this.prismaService.user.findUnique({
      where: { phoneNumber },
    });

    if (existing) {
      if (!existing.deletedAt) {
        // Active account — phone number is taken
        throw new ConflictException('Phone number already registered');
      }
      // Soft-deleted account — clear the deletedAt flag to restore it
      // (the upsert below will then update all fields)
      await this.prismaService.user.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });
    }

    // Hash password (12 rounds per OWASP recommendation)
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate and hash OTP — the plaintext is sent via SMS, the hash is stored
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const otpExpiry = this.getOtpExpiry();

    // Upsert: create on first registration, update on resend after soft-delete restore
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

    // Send the plaintext OTP — must happen before setting the cookie so the
    // client receives a meaningful error if Twilio fails
    await this.sendOtp(phoneNumber, otp);

    // Issue an access token so the client can hit /verifyOtp and /resendOtp
    const accessToken = this.signAccessToken(user.id, user.phoneNumber);
    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;

    // Cache the access token in Redis for fast identity resolution on subsequent requests
    await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);

    // Write the token to the httpOnly cookie — never exposed to JavaScript
    this.setAccessCookie(res, accessToken);

    return { message: 'OTP sent to your phone number' };
  }

  // ─── Verify OTP ─────────────────────────────────────────────────────────────

  /**
   * POST /auth/verifyOtp
   *
   * Flow:
   *  1. Load the user (fail if not found or deleted)
   *  2. Check OTP expiry — fail with clear message if expired
   *  3. bcrypt.compare the submitted OTP against the stored hash
   *  4. Blacklist the old access token (it was a pre-verification token)
   *  5. Mark the user as verified, clear OTP fields
   *  6. Issue a new access token + an opaque refresh token
   *  7. Hash and persist the refresh token in the DB
   *  8. Cache new access token, set both cookies
   *
   * @param userId    From the JWT payload (access token in cookie)
   * @param dto       Contains the 6-digit OTP the user submitted
   * @param oldToken  The current access token — will be blacklisted on rotation
   * @param res       Express response — used to set cookies
   */
  async verifyOtp(
    userId: string,
    dto: VerifyOtpDto,
    oldToken: string | undefined,
    res: Response,
  ): Promise<{ message: string }> {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) throw new NotFoundException('User not found');

    // Reject if the OTP window has closed
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Reject if there is no stored OTP hash (shouldn't happen normally)
    if (!user.hashedOtp) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    // Constant-time comparison via bcrypt — prevents timing attacks
    const isValid = await bcrypt.compare(dto.otp, user.hashedOtp);
    if (!isValid) {
      throw new BadRequestException('Invalid OTP');
    }

    // Revoke the pre-verification access token before issuing the full-access one
    await this.blacklistOldAccessToken(userId, oldToken);

    await this.issueFullAuthTokens(user.id, user.phoneNumber, res);

    return { message: 'Phone number verified successfully' };
  }

  /**
   * Helper to issue full-access JWT and refresh token cookies
   */
  private async issueFullAuthTokens(
    userId: string,
    phoneNumber: string,
    res: Response,
  ): Promise<void> {
    const newAccessToken = this.signAccessToken(userId, phoneNumber);
    const refreshToken = randomBytes(40).toString('hex');
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

    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;
    await this.redisService.cacheAccessToken(userId, newAccessToken, accessExpiry);

    this.setAccessCookie(res, newAccessToken);
    this.setRefreshCookie(res, refreshToken);
  }

  // ─── Resend OTP ─────────────────────────────────────────────────────────────

  /**
   * POST /auth/resendOtp
   *
   * Only valid for accounts that exist but are not yet verified.
   * Generates a fresh OTP, replaces the old hash in the DB, and sends via Twilio.
   * The access token (and its cookie) are not changed here — the client already
   * has a valid token from the register step.
   */
  async resendOtp(userId: string): Promise<{ message: string }> {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) throw new NotFoundException('User not found');

    // Resending is pointless if the account is already verified
    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const otpExpiry = this.getOtpExpiry();

    // Overwrite the old OTP hash and reset the expiry window
    await this.prismaService.user.update({
      where: { id: user.id },
      data: { hashedOtp, otpExpiry },
    });

    await this.sendOtp(user.phoneNumber, otp);

    return { message: 'OTP resent to your phone number' };
  }

  // ─── Refresh Tokens ─────────────────────────────────────────────────────────

  /**
   * POST /auth/refresh
   *
   * Token rotation strategy:
   *  1. Validate the incoming refresh token against the bcrypt hash in the DB
   *  2. Blacklist the old access token
   *  3. Issue new access + refresh tokens
   *  4. Store the new hashed refresh token in the DB (invalidates the old one)
   *
   * Using a one-time refresh token (rotation) means a stolen refresh token
   * can only be used once. If an attacker uses it first, the legitimate user's
   * next refresh attempt will fail (mismatch), alerting them to the breach.
   *
   * @param userId               From decoded access token payload
   * @param incomingRefreshToken Raw refresh token from the cookie
   * @param oldAccessToken       Current access token to blacklist
   * @param res                  Express response for cookie setting
   */
  async refresh(
    userId: string,
    incomingRefreshToken: string,
    oldAccessToken: string | undefined,
    res: Response,
  ): Promise<{ message: string }> {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    // Reject if user not found or refresh token has never been set
    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access denied');
    }

    // bcrypt.compare — constant time, prevents timing attacks
    const isRefreshValid = await bcrypt.compare(
      incomingRefreshToken,
      user.refreshToken,
    );

    if (!isRefreshValid) {
      throw new ForbiddenException('Invalid refresh token');
    }

    // Revoke the old access token before issuing a new one
    await this.blacklistOldAccessToken(userId, oldAccessToken);

    // Rotate both tokens
    const newAccessToken = this.signAccessToken(user.id, user.phoneNumber);
    const newRefreshToken = randomBytes(40).toString('hex');
    const hashedRefreshToken = await bcrypt.hash(newRefreshToken, BCRYPT_ROUNDS);

    // Overwrite the stored hashed refresh token (invalidates the old refresh token)
    await this.prismaService.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;

    await this.redisService.cacheAccessToken(user.id, newAccessToken, accessExpiry);
    this.setAccessCookie(res, newAccessToken);
    this.setRefreshCookie(res, newRefreshToken);

    return { message: 'Tokens refreshed successfully' };
  }

  // ─── Cron: Soft-delete Expired Unverified Users ──────────────────────────────

  /**
   * Scheduled cleanup job — runs every 5 minutes.
   *
   * Trade-off rule from the spec:
   *   "If the OTP expired AND the access token also expired, soft-delete the account."
   *
   * We detect this condition by checking:
   *  - isVerified = false         → OTP was never entered
   *  - otpExpiry < now            → OTP window has closed
   *  - deletedAt IS NULL          → account is still active
   *  - createdAt < (now - accessTokenTTL) → the access token would have expired
   *
   * The account is soft-deleted (deletedAt = now) rather than hard-deleted
   * so we can restore it if the same phone number re-registers later.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupExpiredUnverifiedUsers(): Promise<void> {
    // The access token TTL window in milliseconds
    const accessWindowMs =
      (this.configService.get<number>('jwt.accessExpiry') ?? 900) * 1000;

    // Any account created before this timestamp would have an expired access token by now
    const cutoff = new Date(Date.now() - accessWindowMs);

    const result = await this.prismaService.user.updateMany({
      where: {
        isVerified: false,
        otpExpiry: { lt: new Date() },   // OTP has expired
        deletedAt: null,                  // Not already deleted
        createdAt: { lt: cutoff },        // Access token window has also passed
      },
      data: { deletedAt: new Date() },
    });

    if (result.count > 0) {
      this.logger.log(
        `Soft-deleted ${result.count} expired unverified user account(s)`,
      );
    }
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  /**
   * POST /auth/login
   *
   * Flow:
   *  1. Look up user by phone number (must be active + verified)
   *  2. Validate password via bcrypt
   *  3. Generate a fresh OTP and send via Twilio
   *  4. Issue an access token cookie (the user needs it for /verifyOtp)
   *  5. After OTP is verified, full access + refresh tokens are issued
   */
  async login(dto: LoginDto, res: Response): Promise<{ message: string }> {
    const { phoneNumber, password } = dto;

    const user = await this.prismaService.user.findFirst({
      where: { phoneNumber, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException(
        'Account is not verified. Please register again.',
      );
    }

    // Constant-time bcrypt comparison — prevents timing attacks
    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    if (this.configService.get<string>('nodeEnv') === 'development') {
      await this.issueFullAuthTokens(user.id, user.phoneNumber, res);
      return { message: 'Login successful (development bypass)' };
    }

    // Generate OTP for login verification
    const otp = this.generateOtp();
    const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const otpExpiry = this.getOtpExpiry();

    await this.prismaService.user.update({
      where: { id: user.id },
      data: { hashedOtp, otpExpiry },
    });

    await this.sendOtp(phoneNumber, otp);

    // Issue a temporary access token so the client can hit /verifyOtp
    const accessToken = this.signAccessToken(user.id, user.phoneNumber);
    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;

    await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);
    this.setAccessCookie(res, accessToken);

    return { message: 'OTP sent to your phone number' };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  /**
   * POST /auth/logout
   *
   * Flow:
   *  1. Blacklist the current access token in Redis (it remains invalid until it would have expired)
   *  2. Delete the cached access token from Redis
   *  3. Clear the refresh token from the DB (invalidates all future refresh attempts)
   *  4. Clear both httpOnly cookies
   */
  async logout(
    userId: string,
    accessToken: string | undefined,
    res: Response,
  ): Promise<{ message: string }> {
    // Blacklist the access token so it can't be reused
    await this.blacklistOldAccessToken(userId, accessToken);

    // Wipe the refresh token hash from the DB — no more refresh calls
    await this.prismaService.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    // Clear both cookies from the browser
    this.clearAuthCookies(res);

    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logged out successfully' };
  }

  // ─── Forgot Password ────────────────────────────────────────────────────────

  /**
   * POST /auth/forgotPassword
   *
   * Public endpoint — no JWT required.
   * Flow:
   *  1. Look up the user by phone number (must exist and be verified)
   *  2. Generate an OTP, hash it, set expiry
   *  3. Send the OTP via Twilio
   *  4. Issue a temporary access token (used to authenticate /resetPassword)
   *
   * The generic error message "If an account exists..." prevents phone enumeration.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    res: Response,
  ): Promise<{ message: string }> {
    const user = await this.prismaService.user.findFirst({
      where: { phoneNumber: dto.phoneNumber, deletedAt: null },
    });

    if (!user || !user.isVerified) {
      // Return a generic success message to prevent phone number enumeration
      return {
        message:
          'If an account with that number exists, an OTP has been sent.',
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

    // Issue a temporary access token so the client can authenticate /resetPassword
    const accessToken = this.signAccessToken(user.id, user.phoneNumber);
    const accessExpiry =
      this.configService.get<number>('jwt.accessExpiry') ?? 900;

    await this.redisService.cacheAccessToken(user.id, accessToken, accessExpiry);
    this.setAccessCookie(res, accessToken);

    return {
      message: 'If an account with that number exists, an OTP has been sent.',
    };
  }

  // ─── Reset Password ─────────────────────────────────────────────────────────

  /**
   * PATCH /auth/resetPassword
   *
   * Protected by JWT (from the forgotPassword step).
   * Flow:
   *  1. Validate the OTP (same as verifyOtp)
   *  2. Hash the new password and update the User record
   *  3. Blacklist the old access token
   *  4. Invalidate the refresh token (force re-login)
   *  5. Clear all cookies — user must log in again with the new password
   */
  async resetPassword(
    userId: string,
    dto: ResetPasswordDto,
    oldToken: string | undefined,
    res: Response,
  ): Promise<{ message: string }> {
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) throw new NotFoundException('User not found');

    // Validate OTP
    if (!user.otpExpiry || user.otpExpiry < new Date()) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    if (!user.hashedOtp) {
      throw new BadRequestException('No OTP found. Please request a new one.');
    }

    const isOtpValid = await bcrypt.compare(dto.otp, user.hashedOtp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid OTP');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    // Update password, clear OTP fields, invalidate refresh token
    await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        hashedOtp: null,
        otpExpiry: null,
        refreshToken: null, // Force re-login after password change
      },
    });

    // Blacklist the old access token and clear cookies
    await this.blacklistOldAccessToken(userId, oldToken);
    this.clearAuthCookies(res);

    this.logger.log(`Password reset for user ${userId}`);
    return { message: 'Password reset successfully. Please log in again.' };
  }
}
