/**
 * booking.service.ts
 *
 * Core business logic for the Booking module.
 *
 * Orchestrates:
 *  - Booking creation, acceptance, completion, cancellation, dispute
 *  - Review submission
 *  - Paginated list queries (my-hires, my-jobs)
 *  - Redis caching with invalidation on status changes
 *  - Notification dispatch (via INotificationService)
 *  - Trust score recalculation (via ITrustService)
 *
 * All state mutations follow the workflow:
 *  1. Validate (via BookingValidator)
 *  2. Persist (via PrismaService)
 *  3. Invalidate cache (via RedisService)
 *  4. Side effects (notify, recalculate trust)
 *  5. Log structured transition info
 */
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { BookingValidator } from './booking.validator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { DisputeBookingDto } from './dto/dispute-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import { NOTIFICATION_SERVICE } from './interfaces/notification.interface';
import type { INotificationService } from './interfaces/notification.interface';
import { TRUST_SERVICE } from './interfaces/trust.interface';
import type { ITrustService } from './interfaces/trust.interface';

/** Cache TTLs in seconds */
const CACHE_TTL = {
  BOOKING_DETAIL: 300, // 5 minutes
  BOOKING_LIST: 120,   // 2 minutes
} as const;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly validator: BookingValidator,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    @Inject(TRUST_SERVICE)
    private readonly trustService: ITrustService,
  ) {}

  // ─── CREATE BOOKING ───────────────────────────────────────────────────────────

  async createBooking(userId: string, dto: CreateBookingDto) {
    const { customerProfile, providerProfile } =
      await this.validator.validateCreateBooking(
        userId,
        dto.providerProfileId,
        dto.bookingType,
        dto.scheduledAt,
      );

    const booking = await this.prisma.booking.create({
      data: {
        customerId: customerProfile.userId,
        customerProfileId: customerProfile.id,
        providerId: providerProfile.userId,
        providerProfileId: dto.providerProfileId,
        serviceType: dto.serviceType,
        description: dto.description,
        bookingType: dto.bookingType,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        priceAgreed: dto.priceAgreed,
        currency: dto.currency ?? 'NGN',
        locationAddress: dto.locationAddress,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes,
      },
    });

    this.logger.log(
      `Booking created: id=${booking.id} customer=${customerProfile.id} provider=${dto.providerProfileId} status=PENDING`,
    );

    // Notify provider of new booking request
    await this.notificationService.notify(
      providerProfile.userId,
      dto.providerProfileId,
      'BOOKING_CREATED',
      'New booking request',
      `You have a new ${dto.serviceType} booking request`,
      { bookingId: booking.id, serviceType: dto.serviceType },
    );

    return {
      id: booking.id,
      providerProfileId: booking.providerProfileId,
      customerProfileId: booking.customerProfileId,
      serviceType: booking.serviceType,
      status: booking.status,
      bookingType: booking.bookingType,
      priceAgreed: booking.priceAgreed ? Number(booking.priceAgreed) : null,
      currency: booking.currency,
      createdAt: booking.createdAt,
    };
  }

  // ─── GET MY HIRES (customer view) ─────────────────────────────────────────────

  async getMyHires(userId: string, query: BookingQueryDto) {
    const profile = await this.validator.getUserProfile(userId);
    const { status, page = 1, limit = 10 } = query;

    // Check cache
    const cacheKey = `bookings:customer:${profile.id}:${status ?? 'all'}:${page}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { ...JSON.parse(cached), cached: true };
    }

    const where: Record<string, unknown> = { customerProfileId: profile.id };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          providerProfile: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          review: { select: { id: true, rating: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const result = {
      bookings: bookings.map((b) => ({
        ...b,
        priceAgreed: b.priceAgreed ? Number(b.priceAgreed) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL.BOOKING_LIST);

    return { ...result, cached: false };
  }

  // ─── GET MY JOBS (provider view) ──────────────────────────────────────────────

  async getMyJobs(userId: string, query: BookingQueryDto) {
    const profile = await this.validator.getUserProfile(userId);
    const { status, page = 1, limit = 10 } = query;

    // Check cache
    const cacheKey = `bookings:provider:${profile.id}:${status ?? 'all'}:${page}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return { ...JSON.parse(cached), cached: true };
    }

    const where: Record<string, unknown> = { providerProfileId: profile.id };
    if (status) where.status = status;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customerProfile: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          review: { select: { id: true, rating: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const result = {
      bookings: bookings.map((b) => ({
        ...b,
        priceAgreed: b.priceAgreed ? Number(b.priceAgreed) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL.BOOKING_LIST);

    return { ...result, cached: false };
  }

  // ─── GET BOOKING BY ID ────────────────────────────────────────────────────────

  async getBookingById(bookingId: string, userId: string) {
    const profile = await this.validator.getUserProfile(userId);

    // Check cache
    const cacheKey = `booking:${bookingId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Still enforce access control even on cached data
      if (
        parsed.customerProfileId !== profile.id &&
        parsed.providerProfileId !== profile.id
      ) {
        // Don't reveal cached data — run through validator
        await this.validator.validateBookingAccess(bookingId, profile.id);
      }
      return { ...parsed, cached: true };
    }

    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    const result = {
      ...booking,
      priceAgreed: booking.priceAgreed ? Number(booking.priceAgreed) : null,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL.BOOKING_DETAIL);

    return { ...result, cached: false };
  }

  // ─── ACCEPT BOOKING ───────────────────────────────────────────────────────────

  async acceptBooking(bookingId: string, userId: string) {
    const profile = await this.validator.getUserProfile(userId);
    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    this.validator.validateIsProvider(booking.providerProfileId, profile.id);
    this.validator.validateStatusTransition(booking.status, BookingStatus.ACCEPTED, 'accept');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.ACCEPTED },
    });

    this.logger.log(
      `Booking accepted: id=${bookingId} provider=${profile.id} PENDING→ACCEPTED`,
    );

    await this.invalidateBookingCaches(booking);

    // Notify customer
    await this.notificationService.notify(
      booking.customerId,
      booking.customerProfileId,
      'BOOKING_ACCEPTED',
      'Your booking was accepted',
      `Your ${booking.serviceType} booking has been accepted`,
      { bookingId },
    );

    return {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── COMPLETE BOOKING ─────────────────────────────────────────────────────────

  async completeBooking(bookingId: string, userId: string) {
    const profile = await this.validator.getUserProfile(userId);
    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    this.validator.validateStatusTransition(booking.status, BookingStatus.COMPLETED, 'complete');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Booking completed: id=${bookingId} by=${profile.id} ${booking.status}→COMPLETED`,
    );

    await this.invalidateBookingCaches(booking);

    // Trigger trust recalculation
    await this.trustService.recalculate(booking.providerProfileId);

    // Notify customer
    await this.notificationService.notify(
      booking.customerId,
      booking.customerProfileId,
      'BOOKING_COMPLETED',
      'Job marked as complete',
      `Your ${booking.serviceType} booking has been marked as complete. Please leave a review!`,
      { bookingId },
    );

    return {
      id: updated.id,
      status: updated.status,
      completedAt: updated.completedAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── CANCEL BOOKING ───────────────────────────────────────────────────────────

  async cancelBooking(bookingId: string, userId: string, dto: CancelBookingDto) {
    const profile = await this.validator.getUserProfile(userId);
    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    this.validator.validateStatusTransition(booking.status, BookingStatus.CANCELLED, 'cancel');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });

    this.logger.log(
      `Booking cancelled: id=${bookingId} by=${profile.id} ${booking.status}→CANCELLED reason="${dto.reason}"`,
    );

    await this.invalidateBookingCaches(booking);

    // Notify both parties
    const cancelledBy =
      profile.id === booking.customerProfileId ? 'customer' : 'provider';

    await Promise.all([
      this.notificationService.notify(
        booking.customerId,
        booking.customerProfileId,
        'BOOKING_CANCELLED',
        'Booking was cancelled',
        `Your ${booking.serviceType} booking was cancelled by the ${cancelledBy}`,
        { bookingId, reason: dto.reason },
      ),
      this.notificationService.notify(
        booking.providerId,
        booking.providerProfileId,
        'BOOKING_CANCELLED',
        'Booking was cancelled',
        `A ${booking.serviceType} booking was cancelled by the ${cancelledBy}`,
        { bookingId, reason: dto.reason },
      ),
    ]);

    return {
      id: updated.id,
      status: updated.status,
      cancelledAt: updated.cancelledAt,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── DISPUTE BOOKING ──────────────────────────────────────────────────────────

  async disputeBooking(bookingId: string, userId: string, dto: DisputeBookingDto) {
    const profile = await this.validator.getUserProfile(userId);
    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    this.validator.validateStatusTransition(booking.status, BookingStatus.DISPUTED, 'dispute');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.DISPUTED,
        disputeReason: dto.reason,
        disputeDescription: dto.description,
      },
    });

    this.logger.log(
      `Booking disputed: id=${bookingId} by=${profile.id} ${booking.status}→DISPUTED reason="${dto.reason}"`,
    );

    await this.invalidateBookingCaches(booking);

    // Trigger trust recalculation (penalty applied to provider)
    await this.trustService.recalculate(booking.providerProfileId);

    // Notify both parties
    await Promise.all([
      this.notificationService.notify(
        booking.customerId,
        booking.customerProfileId,
        'BOOKING_DISPUTED',
        'A dispute was raised',
        `A dispute was raised on your ${booking.serviceType} booking`,
        { bookingId, reason: dto.reason },
      ),
      this.notificationService.notify(
        booking.providerId,
        booking.providerProfileId,
        'BOOKING_DISPUTED',
        'A dispute was raised',
        `A dispute was raised on your ${booking.serviceType} booking`,
        { bookingId, reason: dto.reason },
      ),
    ]);

    return {
      id: updated.id,
      status: updated.status,
      disputeReason: updated.disputeReason,
      updatedAt: updated.updatedAt,
    };
  }

  // ─── SUBMIT REVIEW ────────────────────────────────────────────────────────────

  async submitReview(bookingId: string, userId: string, dto: ReviewBookingDto) {
    const profile = await this.validator.getUserProfile(userId);
    const booking = await this.validator.validateBookingAccess(bookingId, profile.id);

    // Only customer can review
    this.validator.validateIsCustomer(booking.customerProfileId, profile.id);

    // Booking must be completed
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new ConflictException('Can only review a completed booking');
    }

    // Check for existing review (unique constraint will also catch this)
    const existingReview = await this.prisma.review.findUnique({
      where: { bookingId },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this booking');
    }

    const review = await this.prisma.review.create({
      data: {
        bookingId,
        reviewerId: profile.userId,
        reviewerProfileId: profile.id,
        providerId: booking.providerId,
        providerProfileId: booking.providerProfileId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    this.logger.log(
      `Review submitted: reviewId=${review.id} bookingId=${bookingId} rating=${dto.rating} provider=${booking.providerProfileId}`,
    );

    // Invalidate booking cache (now includes review)
    await this.invalidateBookingCaches(booking);

    // Trigger trust recalculation
    await this.trustService.recalculate(booking.providerProfileId);

    // Notify provider
    await this.notificationService.notify(
      booking.providerId,
      booking.providerProfileId,
      'REVIEW_RECEIVED',
      'You received a new review',
      `You received a ${dto.rating}-star review for your ${booking.serviceType} service`,
      { bookingId, reviewId: review.id, rating: dto.rating },
    );

    return {
      id: review.id,
      bookingId: review.bookingId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    };
  }

  // ─── CACHE INVALIDATION ───────────────────────────────────────────────────────

  /**
   * Invalidates all cached data related to a booking.
   *
   * Uses Redis KEYS pattern scan for wildcard invalidation.
   * Acceptable at hackathon scale — production would use Redis tags.
   */
  private async invalidateBookingCaches(booking: {
    id: string;
    customerProfileId: string;
    providerProfileId: string;
  }): Promise<void> {
    try {
      // Delete specific booking cache
      await this.redis.del(`booking:${booking.id}`);

      // Scan and delete customer list caches
      const client = this.redis.getClient();
      const customerKeys = await client.keys(
        `bookings:customer:${booking.customerProfileId}:*`,
      );
      if (customerKeys.length > 0) {
        await client.del(...customerKeys);
      }

      // Scan and delete provider list caches
      const providerKeys = await client.keys(
        `bookings:provider:${booking.providerProfileId}:*`,
      );
      if (providerKeys.length > 0) {
        await client.del(...providerKeys);
      }

      this.logger.debug(
        `Cache invalidated for booking ${booking.id}: ${customerKeys.length + providerKeys.length + 1} keys`,
      );
    } catch (error) {
      // Cache invalidation failures should not break the request
      this.logger.warn(`Cache invalidation failed for booking ${booking.id}`, error);
    }
  }
}
