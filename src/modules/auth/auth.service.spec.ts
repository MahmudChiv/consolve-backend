/**
 * auth.service.spec.ts
 *
 * Unit tests for AuthService.
 *
 * All external dependencies are mocked:
 *  - PrismaService — in-memory mock object
 *  - RedisService  — in-memory mock object
 *  - JwtService    — returns a static signed token
 *  - ConfigService — returns hardcoded config values
 *  - twilio        — module-level mock (must be declared before imports)
 *
 * The twilio mock is hoisted by Jest before module resolution, ensuring
 * AuthService receives the mocked client rather than the real one.
 */

// ── Twilio mock — must be declared BEFORE any imports that trigger AuthService ──
// jest.mock is hoisted to the top of the file by babel-jest regardless of
// position, but we keep it here for clarity.
const mockTwilioCreate = jest.fn().mockResolvedValue({ sid: 'SM_TEST' });

jest.mock('twilio', () => {
  // twilio is a CommonJS module that exports a function directly.
  // When auth.service.ts does: const twilio = require('twilio'),
  // calling twilio(sid, token) must return the mock client.
  const mockFn = jest.fn().mockImplementation(() => ({
    messages: { create: mockTwilioCreate },
  }));
  return mockFn;
});

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

// ── Redis mock ────────────────────────────────────────────────────────────────
const mockRedis = {
  cacheAccessToken: jest.fn(),
  blacklist: jest.fn(),
  deleteCachedAccessToken: jest.fn(),
  isBlacklisted: jest.fn(),
};

// ── JWT mock — returns a predictable static token ─────────────────────────────
const mockJwt = {
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
  decode: jest.fn(),
};

// ── Config mock — maps config keys to test values ─────────────────────────────
const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, unknown> = {
      'jwt.accessSecret': 'test_secret_that_is_long_enough_for_validation',
      'jwt.accessExpiry': 900,
      'jwt.refreshExpiry': 604800,
      'otp.expirySeconds': 600,
      'nodeEnv': 'test',
      'twilio.accountSid': 'AC_TEST',
      'twilio.authToken': 'AUTH_TEST',
      'twilio.phoneNumber': '+10000000000',
    };
    return map[key];
  }),
};

// ── Response mock ─────────────────────────────────────────────────────────────
const mockRes = {
  cookie: jest.fn(),
} as unknown as Response;

// ── User factory ──────────────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  id: 'user-uuid',
  phoneNumber: '+2348000000001',
  hashedPassword: 'hashed_pw',
  hashedOtp: 'hashed_otp',
  otpExpiry: new Date(Date.now() + 600_000), // expires in 10 min
  refreshToken: null,
  isVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    const dto: RegisterDto = {
      phoneNumber: '+2348000000001',
      password: 'MyStr0ng!Pass',
    };

    it('should create a new user and send OTP', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);  // No existing user
      mockPrisma.user.upsert.mockResolvedValue(makeUser());

      const result = await service.register(dto, mockRes);

      expect(mockPrisma.user.upsert).toHaveBeenCalled();
      expect(mockTwilioCreate).toHaveBeenCalled();
      expect(mockRedis.cacheAccessToken).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.any(Object),
      );
      expect(result.message).toBe('OTP sent to your phone number');
    });

    it('should throw ConflictException if phone already registered and active', async () => {
      // An existing account with no deletedAt is considered active
      mockPrisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: null }));

      await expect(service.register(dto, mockRes)).rejects.toThrow(ConflictException);
    });

    it('should restore and re-register a soft-deleted account', async () => {
      const softDeleted = makeUser({ deletedAt: new Date() });
      mockPrisma.user.findUnique.mockResolvedValue(softDeleted);
      mockPrisma.user.update.mockResolvedValue(softDeleted);   // restore call
      mockPrisma.user.upsert.mockResolvedValue(makeUser());    // upsert call

      const result = await service.register(dto, mockRes);
      expect(result.message).toBe('OTP sent to your phone number');
    });

    it('should throw BadRequestException if Twilio fails', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.upsert.mockResolvedValue(makeUser());
      mockTwilioCreate.mockRejectedValueOnce(new Error('Twilio error'));

      await expect(service.register(dto, mockRes)).rejects.toThrow(BadRequestException);
    });
  });

  // ── verifyOtp ─────────────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    const dto: VerifyOtpDto = { otp: '123456' };

    it('should verify OTP and issue new tokens', async () => {
      const hashedOtp = await bcrypt.hash('123456', 10);
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ hashedOtp, otpExpiry: new Date(Date.now() + 60_000) }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyOtp('user-uuid', dto, 'old.token', mockRes);

      expect(mockRedis.blacklist).toHaveBeenCalled();           // Old token blacklisted
      expect(mockRedis.cacheAccessToken).toHaveBeenCalled();   // New token cached
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', expect.any(String), expect.any(Object));
      expect(result.message).toBe('Phone number verified successfully');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.verifyOtp('missing', dto, undefined, mockRes))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if OTP has expired', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ otpExpiry: new Date(Date.now() - 1000) }), // in the past
      );
      await expect(service.verifyOtp('user-uuid', dto, undefined, mockRes))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if OTP is invalid', async () => {
      const hashedOtp = await bcrypt.hash('999999', 10); // wrong OTP hashed
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ hashedOtp, otpExpiry: new Date(Date.now() + 60_000) }),
      );
      await expect(service.verifyOtp('user-uuid', dto, undefined, mockRes))
        .rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no OTP hash is stored', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(
        makeUser({ hashedOtp: null, otpExpiry: new Date(Date.now() + 60_000) }),
      );
      await expect(service.verifyOtp('user-uuid', dto, undefined, mockRes))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ── resendOtp ─────────────────────────────────────────────────────────────

  describe('resendOtp', () => {
    it('should generate a new OTP and send it', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.resendOtp('user-uuid');

      expect(mockTwilioCreate).toHaveBeenCalled();
      expect(result.message).toBe('OTP resent to your phone number');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resendOtp('missing')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if account is already verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ isVerified: true }));
      await expect(service.resendOtp('user-uuid')).rejects.toThrow(BadRequestException);
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should rotate tokens when refresh token is valid', async () => {
      const rawRefresh = 'raw-refresh-token-value';
      const hashedRefresh = await bcrypt.hash(rawRefresh, 10);

      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ refreshToken: hashedRefresh }));
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.refresh('user-uuid', rawRefresh, 'old.token', mockRes);

      expect(mockRedis.blacklist).toHaveBeenCalled();
      expect(mockRedis.cacheAccessToken).toHaveBeenCalled();
      expect(result.message).toBe('Tokens refreshed successfully');
    });

    it('should throw ForbiddenException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.refresh('missing', 'token', undefined, mockRes))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if refresh token does not match', async () => {
      const hashedRefresh = await bcrypt.hash('correct-token', 10);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ refreshToken: hashedRefresh }));

      await expect(service.refresh('user-uuid', 'wrong-token', undefined, mockRes))
        .rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if user has no stored refresh token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ refreshToken: null }));
      await expect(service.refresh('user-uuid', 'any-token', undefined, mockRes))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ── cleanupExpiredUnverifiedUsers ─────────────────────────────────────────

  describe('cleanupExpiredUnverifiedUsers (cron)', () => {
    it('should soft-delete expired unverified users', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 3 });

      await service.cleanupExpiredUnverifiedUsers();

      expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isVerified: false,
            deletedAt: null,
          }),
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should do nothing if no users qualify for soft-delete', async () => {
      mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

      await service.cleanupExpiredUnverifiedUsers();

      // updateMany was still called — we just expect no side effects
      expect(mockPrisma.user.updateMany).toHaveBeenCalled();
    });
  });
});
