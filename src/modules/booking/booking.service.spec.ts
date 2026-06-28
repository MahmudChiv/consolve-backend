/**
 * booking.service.spec.ts
 *
 * Unit tests for BookingService.
 * Mocks: PrismaService, RedisService, BookingValidator,
 *        NotificationMockService, TrustMockService
 *
 * Coverage target: >90%
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { NOTIFICATION_SERVICE } from './interfaces/notification.interface';
import { TRUST_SERVICE } from './interfaces/trust.interface';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, BookingType } from '@prisma/client';

// ─── Test data factories ────────────────────────────────────────────────────

const mockCustomerProfile = { id: 'cust-profile-1', userId: 'user-1' };
const mockProviderProfile = { id: 'prov-profile-1', userId: 'user-2' };

const mockBooking = {
  id: 'booking-1',
  customerId: 'user-1',
  customerProfileId: 'cust-profile-1',
  providerId: 'user-2',
  providerProfileId: 'prov-profile-1',
  serviceType: 'Tailoring',
  description: 'Make me a senator wear',
  status: BookingStatus.PENDING,
  bookingType: BookingType.HIRE_NOW,
  scheduledAt: null,
  priceAgreed: 25000,
  currency: 'NGN',
  locationAddress: 'Lagos',
  latitude: 6.5244,
  longitude: 3.3792,
  notes: null,
  disputeReason: null,
  disputeDescription: null,
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date('2026-06-28T10:00:00Z'),
  updatedAt: new Date('2026-06-28T10:00:00Z'),
  review: null,
};

const mockAcceptedBooking = { ...mockBooking, status: BookingStatus.ACCEPTED };
const mockCompletedBooking = {
  ...mockBooking,
  status: BookingStatus.COMPLETED,
  completedAt: new Date('2026-06-28T12:00:00Z'),
};

// ─── Mock factories ─────────────────────────────────────────────────────────

const createMockPrisma = () => ({
  booking: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  review: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  userProfile: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
});

const createMockRedis = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue({
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(undefined),
  }),
});

const createMockValidator = () => ({
  validateCreateBooking: jest.fn(),
  validateBookingAccess: jest.fn(),
  validateStatusTransition: jest.fn(),
  validateIsProvider: jest.fn(),
  validateIsCustomer: jest.fn(),
  getUserProfile: jest.fn(),
});

const createMockNotification = () => ({
  notify: jest.fn().mockResolvedValue(undefined),
});

const createMockTrust = () => ({
  recalculate: jest.fn().mockResolvedValue(undefined),
});

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('BookingService', () => {
  let service: BookingService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: ReturnType<typeof createMockRedis>;
  let validator: ReturnType<typeof createMockValidator>;
  let notificationService: ReturnType<typeof createMockNotification>;
  let trustService: ReturnType<typeof createMockTrust>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();
    validator = createMockValidator();
    notificationService = createMockNotification();
    trustService = createMockTrust();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: BookingValidator, useValue: validator },
        { provide: NOTIFICATION_SERVICE, useValue: notificationService },
        { provide: TRUST_SERVICE, useValue: trustService },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createBooking ──────────────────────────────────────────────────────────

  describe('createBooking', () => {
    const dto = {
      providerProfileId: 'prov-profile-1',
      serviceType: 'Tailoring',
      description: 'Senator wear',
      bookingType: BookingType.HIRE_NOW,
      priceAgreed: 25000,
      currency: 'NGN',
    };

    it('should create a booking and notify the provider', async () => {
      validator.validateCreateBooking.mockResolvedValue({
        customerProfile: mockCustomerProfile,
        providerProfile: mockProviderProfile,
      });
      prisma.booking.create.mockResolvedValue(mockBooking);

      const result = await service.createBooking('user-1', dto);

      expect(result.id).toBe('booking-1');
      expect(result.status).toBe('PENDING');
      expect(result.serviceType).toBe('Tailoring');
      expect(validator.validateCreateBooking).toHaveBeenCalledWith(
        'user-1',
        'prov-profile-1',
        BookingType.HIRE_NOW,
        undefined,
      );
      expect(prisma.booking.create).toHaveBeenCalledTimes(1);
      expect(notificationService.notify).toHaveBeenCalledWith(
        'user-2',
        'prov-profile-1',
        'BOOKING_CREATED',
        'New booking request',
        expect.any(String),
        expect.objectContaining({ bookingId: 'booking-1' }),
      );
    });

    it('should pass scheduledAt for SCHEDULED bookings', async () => {
      const scheduledDto = {
        ...dto,
        bookingType: BookingType.SCHEDULED,
        scheduledAt: '2026-07-01T10:00:00Z',
      };

      validator.validateCreateBooking.mockResolvedValue({
        customerProfile: mockCustomerProfile,
        providerProfile: mockProviderProfile,
      });
      prisma.booking.create.mockResolvedValue({
        ...mockBooking,
        bookingType: BookingType.SCHEDULED,
        scheduledAt: new Date('2026-07-01T10:00:00Z'),
      });

      const result = await service.createBooking('user-1', scheduledDto);

      expect(result.bookingType).toBe('SCHEDULED');
      expect(validator.validateCreateBooking).toHaveBeenCalledWith(
        'user-1',
        'prov-profile-1',
        BookingType.SCHEDULED,
        '2026-07-01T10:00:00Z',
      );
    });

    it('should propagate validator errors', async () => {
      validator.validateCreateBooking.mockRejectedValue(
        new BadRequestException('You cannot book yourself'),
      );

      await expect(service.createBooking('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getMyHires ─────────────────────────────────────────────────────────────

  describe('getMyHires', () => {
    const query = { page: 1, limit: 10 };

    it('should return paginated bookings for the customer', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      prisma.booking.findMany.mockResolvedValue([mockBooking]);
      prisma.booking.count.mockResolvedValue(1);

      const result = await service.getMyHires('user-1', query);

      expect(result.bookings).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(result.cached).toBe(false);
      expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('should return cached results when available', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      redis.get.mockResolvedValue(
        JSON.stringify({
          bookings: [mockBooking],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }),
      );

      const result = await service.getMyHires('user-1', query);

      expect(result.cached).toBe(true);
      expect(prisma.booking.findMany).not.toHaveBeenCalled();
    });

    it('should filter by status when provided', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.getMyHires('user-1', {
        ...query,
        status: BookingStatus.PENDING,
      });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerProfileId: 'cust-profile-1', status: 'PENDING' },
        }),
      );
    });
  });

  // ─── getMyJobs ──────────────────────────────────────────────────────────────

  describe('getMyJobs', () => {
    it('should return paginated bookings for the provider', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      prisma.booking.findMany.mockResolvedValue([mockBooking]);
      prisma.booking.count.mockResolvedValue(1);

      const result = await service.getMyJobs('user-2', { page: 1, limit: 10 });

      expect(result.bookings).toHaveLength(1);
      expect(result.cached).toBe(false);
    });

    it('should return cached results when available', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      redis.get.mockResolvedValue(
        JSON.stringify({
          bookings: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        }),
      );

      const result = await service.getMyJobs('user-2', { page: 1, limit: 10 });

      expect(result.cached).toBe(true);
    });
  });

  // ─── getBookingById ─────────────────────────────────────────────────────────

  describe('getBookingById', () => {
    it('should return booking detail and cache it', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);

      const result = await service.getBookingById('booking-1', 'user-1');

      expect(result.id).toBe('booking-1');
      expect(result.cached).toBe(false);
      expect(redis.set).toHaveBeenCalledWith(
        'booking:booking-1',
        expect.any(String),
        300,
      );
    });

    it('should return cached booking if available', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      redis.get.mockResolvedValue(JSON.stringify(mockBooking));

      const result = await service.getBookingById('booking-1', 'user-1');

      expect(result.cached).toBe(true);
      expect(validator.validateBookingAccess).not.toHaveBeenCalled();
    });

    it('should enforce access control even on cached data', async () => {
      const foreignProfile = { id: 'foreign-profile', userId: 'user-3' };
      validator.getUserProfile.mockResolvedValue(foreignProfile);
      redis.get.mockResolvedValue(JSON.stringify(mockBooking));
      validator.validateBookingAccess.mockRejectedValue(
        new ForbiddenException('You do not have access to this booking'),
      );

      await expect(
        service.getBookingById('booking-1', 'user-3'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── acceptBooking ──────────────────────────────────────────────────────────

  describe('acceptBooking', () => {
    it('should accept a PENDING booking (provider only)', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
        updatedAt: new Date(),
      });

      const result = await service.acceptBooking('booking-1', 'user-2');

      expect(result.status).toBe('ACCEPTED');
      expect(validator.validateIsProvider).toHaveBeenCalledWith(
        'prov-profile-1',
        'prov-profile-1',
      );
      expect(validator.validateStatusTransition).toHaveBeenCalledWith(
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        'accept',
      );
      expect(notificationService.notify).toHaveBeenCalledWith(
        'user-1',
        'cust-profile-1',
        'BOOKING_ACCEPTED',
        'Your booking was accepted',
        expect.any(String),
        expect.objectContaining({ bookingId: 'booking-1' }),
      );
    });

    it('should throw if user is not the provider', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);
      validator.validateIsProvider.mockImplementation(() => {
        throw new ForbiddenException('Only the provider can perform this action');
      });

      await expect(
        service.acceptBooking('booking-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if booking is not PENDING', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      validator.validateBookingAccess.mockResolvedValue(mockCompletedBooking);
      validator.validateStatusTransition.mockImplementation(() => {
        throw new BadRequestException(
          'Cannot accept a booking with status COMPLETED',
        );
      });

      await expect(
        service.acceptBooking('booking-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── completeBooking ────────────────────────────────────────────────────────

  describe('completeBooking', () => {
    it('should complete an ACCEPTED booking and trigger trust recalculation', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockAcceptedBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockAcceptedBooking,
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.completeBooking('booking-1', 'user-1');

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeDefined();
      expect(trustService.recalculate).toHaveBeenCalledWith('prov-profile-1');
      expect(notificationService.notify).toHaveBeenCalledWith(
        'user-1',
        'cust-profile-1',
        'BOOKING_COMPLETED',
        'Job marked as complete',
        expect.any(String),
        expect.objectContaining({ bookingId: 'booking-1' }),
      );
    });

    it('should throw on invalid status transition', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking); // PENDING
      validator.validateStatusTransition.mockImplementation(() => {
        throw new BadRequestException(
          'Cannot complete a booking with status PENDING',
        );
      });

      await expect(
        service.completeBooking('booking-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancelBooking ──────────────────────────────────────────────────────────

  describe('cancelBooking', () => {
    it('should cancel a PENDING booking and notify both parties', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Changed my mind',
        updatedAt: new Date(),
      });

      const result = await service.cancelBooking('booking-1', 'user-1', {
        reason: 'Changed my mind',
      });

      expect(result.status).toBe('CANCELLED');
      // Both parties should be notified
      expect(notificationService.notify).toHaveBeenCalledTimes(2);
    });

    it('should not allow cancelling a COMPLETED booking', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockCompletedBooking);
      validator.validateStatusTransition.mockImplementation(() => {
        throw new BadRequestException(
          'Cannot cancel a booking with status COMPLETED',
        );
      });

      await expect(
        service.cancelBooking('booking-1', 'user-1', {
          reason: 'Changed my mind',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── disputeBooking ─────────────────────────────────────────────────────────

  describe('disputeBooking', () => {
    it('should dispute an ACCEPTED booking and trigger trust penalty', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockAcceptedBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockAcceptedBooking,
        status: BookingStatus.DISPUTED,
        disputeReason: 'Provider did not show up',
        updatedAt: new Date(),
      });

      const result = await service.disputeBooking('booking-1', 'user-1', {
        reason: 'Provider did not show up',
        description: 'Full description of what happened',
      });

      expect(result.status).toBe('DISPUTED');
      expect(trustService.recalculate).toHaveBeenCalledWith('prov-profile-1');
      expect(notificationService.notify).toHaveBeenCalledTimes(2);
    });

    it('should not allow disputing a PENDING booking', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking); // PENDING
      validator.validateStatusTransition.mockImplementation(() => {
        throw new BadRequestException(
          'Cannot dispute a booking with status PENDING',
        );
      });

      await expect(
        service.disputeBooking('booking-1', 'user-1', {
          reason: 'Bad work',
          description: 'Details',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── submitReview ───────────────────────────────────────────────────────────

  describe('submitReview', () => {
    it('should submit a review for a COMPLETED booking', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockCompletedBooking);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'review-1',
        bookingId: 'booking-1',
        reviewerId: 'user-1',
        reviewerProfileId: 'cust-profile-1',
        providerId: 'user-2',
        providerProfileId: 'prov-profile-1',
        rating: 5,
        comment: 'Excellent work',
        createdAt: new Date(),
      });

      const result = await service.submitReview('booking-1', 'user-1', {
        rating: 5,
        comment: 'Excellent work',
      });

      expect(result.id).toBe('review-1');
      expect(result.rating).toBe(5);
      expect(trustService.recalculate).toHaveBeenCalledWith('prov-profile-1');
      expect(notificationService.notify).toHaveBeenCalledWith(
        'user-2',
        'prov-profile-1',
        'REVIEW_RECEIVED',
        'You received a new review',
        expect.any(String),
        expect.objectContaining({ rating: 5 }),
      );
    });

    it('should reject review if booking is not COMPLETED', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockAcceptedBooking);

      await expect(
        service.submitReview('booking-1', 'user-1', {
          rating: 5,
          comment: 'Good',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject duplicate review (409 Conflict)', async () => {
      validator.getUserProfile.mockResolvedValue(mockCustomerProfile);
      validator.validateBookingAccess.mockResolvedValue(mockCompletedBooking);
      prisma.review.findUnique.mockResolvedValue({
        id: 'review-existing',
        bookingId: 'booking-1',
      });

      await expect(
        service.submitReview('booking-1', 'user-1', {
          rating: 4,
          comment: 'Again',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject review from non-customer (403)', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      validator.validateBookingAccess.mockResolvedValue(mockCompletedBooking);
      validator.validateIsCustomer.mockImplementation(() => {
        throw new ForbiddenException('Only the customer can perform this action');
      });

      await expect(
        service.submitReview('booking-1', 'user-2', {
          rating: 5,
          comment: 'Self review',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── Cache invalidation ─────────────────────────────────────────────────────

  describe('cache invalidation', () => {
    it('should invalidate caches on accept', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
        updatedAt: new Date(),
      });

      await service.acceptBooking('booking-1', 'user-2');

      expect(redis.del).toHaveBeenCalledWith('booking:booking-1');
      const client = redis.getClient();
      expect(client.keys).toHaveBeenCalledWith(
        'bookings:customer:cust-profile-1:*',
      );
      expect(client.keys).toHaveBeenCalledWith(
        'bookings:provider:prov-profile-1:*',
      );
    });

    it('should not break request if cache invalidation fails', async () => {
      validator.getUserProfile.mockResolvedValue(mockProviderProfile);
      validator.validateBookingAccess.mockResolvedValue(mockBooking);
      prisma.booking.update.mockResolvedValue({
        ...mockBooking,
        status: BookingStatus.ACCEPTED,
        updatedAt: new Date(),
      });
      redis.del.mockRejectedValue(new Error('Redis connection lost'));

      // Should not throw despite Redis failure
      const result = await service.acceptBooking('booking-1', 'user-2');
      expect(result.status).toBe('ACCEPTED');
    });
  });
});
