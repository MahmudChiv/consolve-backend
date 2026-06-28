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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BookingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
const redis_service_1 = require("../common/redis/redis.service");
const booking_validator_1 = require("./booking.validator");
const notification_interface_1 = require("./interfaces/notification.interface");
const trust_interface_1 = require("./interfaces/trust.interface");
const CACHE_TTL = {
    BOOKING_DETAIL: 300,
    BOOKING_LIST: 120,
};
let BookingService = BookingService_1 = class BookingService {
    prisma;
    redis;
    validator;
    notificationService;
    trustService;
    logger = new common_1.Logger(BookingService_1.name);
    constructor(prisma, redis, validator, notificationService, trustService) {
        this.prisma = prisma;
        this.redis = redis;
        this.validator = validator;
        this.notificationService = notificationService;
        this.trustService = trustService;
    }
    async createBooking(userId, dto) {
        const { customerProfile, providerProfile } = await this.validator.validateCreateBooking(userId, dto.providerProfileId, dto.bookingType, dto.scheduledAt);
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
        this.logger.log(`Booking created: id=${booking.id} customer=${customerProfile.id} provider=${dto.providerProfileId} status=PENDING`);
        await this.notificationService.notify(providerProfile.userId, dto.providerProfileId, 'BOOKING_CREATED', 'New booking request', `You have a new ${dto.serviceType} booking request`, { bookingId: booking.id, serviceType: dto.serviceType });
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
    async getMyHires(userId, query) {
        const profile = await this.validator.getUserProfile(userId);
        const { status, page = 1, limit = 10 } = query;
        const cacheKey = `bookings:customer:${profile.id}:${status ?? 'all'}:${page}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }
        const where = { customerProfileId: profile.id };
        if (status)
            where.status = status;
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
        await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL.BOOKING_LIST);
        return { ...result, cached: false };
    }
    async getMyJobs(userId, query) {
        const profile = await this.validator.getUserProfile(userId);
        const { status, page = 1, limit = 10 } = query;
        const cacheKey = `bookings:provider:${profile.id}:${status ?? 'all'}:${page}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            return { ...JSON.parse(cached), cached: true };
        }
        const where = { providerProfileId: profile.id };
        if (status)
            where.status = status;
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
    async getBookingById(bookingId, userId) {
        const profile = await this.validator.getUserProfile(userId);
        const cacheKey = `booking:${bookingId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.customerProfileId !== profile.id &&
                parsed.providerProfileId !== profile.id) {
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
    async acceptBooking(bookingId, userId) {
        const profile = await this.validator.getUserProfile(userId);
        const booking = await this.validator.validateBookingAccess(bookingId, profile.id);
        this.validator.validateIsProvider(booking.providerProfileId, profile.id);
        this.validator.validateStatusTransition(booking.status, client_1.BookingStatus.ACCEPTED, 'accept');
        const updated = await this.prisma.booking.update({
            where: { id: bookingId },
            data: { status: client_1.BookingStatus.ACCEPTED },
        });
        this.logger.log(`Booking accepted: id=${bookingId} provider=${profile.id} PENDING→ACCEPTED`);
        await this.invalidateBookingCaches(booking);
        await this.notificationService.notify(booking.customerId, booking.customerProfileId, 'BOOKING_ACCEPTED', 'Your booking was accepted', `Your ${booking.serviceType} booking has been accepted`, { bookingId });
        return {
            id: updated.id,
            status: updated.status,
            updatedAt: updated.updatedAt,
        };
    }
    async completeBooking(bookingId, userId) {
        const profile = await this.validator.getUserProfile(userId);
        const booking = await this.validator.validateBookingAccess(bookingId, profile.id);
        this.validator.validateStatusTransition(booking.status, client_1.BookingStatus.COMPLETED, 'complete');
        const updated = await this.prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: client_1.BookingStatus.COMPLETED,
                completedAt: new Date(),
            },
        });
        this.logger.log(`Booking completed: id=${bookingId} by=${profile.id} ${booking.status}→COMPLETED`);
        await this.invalidateBookingCaches(booking);
        await this.trustService.recalculate(booking.providerProfileId);
        await this.notificationService.notify(booking.customerId, booking.customerProfileId, 'BOOKING_COMPLETED', 'Job marked as complete', `Your ${booking.serviceType} booking has been marked as complete. Please leave a review!`, { bookingId });
        return {
            id: updated.id,
            status: updated.status,
            completedAt: updated.completedAt,
            updatedAt: updated.updatedAt,
        };
    }
    async cancelBooking(bookingId, userId, dto) {
        const profile = await this.validator.getUserProfile(userId);
        const booking = await this.validator.validateBookingAccess(bookingId, profile.id);
        this.validator.validateStatusTransition(booking.status, client_1.BookingStatus.CANCELLED, 'cancel');
        const updated = await this.prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: client_1.BookingStatus.CANCELLED,
                cancelledAt: new Date(),
                cancelReason: dto.reason,
            },
        });
        this.logger.log(`Booking cancelled: id=${bookingId} by=${profile.id} ${booking.status}→CANCELLED reason="${dto.reason}"`);
        await this.invalidateBookingCaches(booking);
        const cancelledBy = profile.id === booking.customerProfileId ? 'customer' : 'provider';
        await Promise.all([
            this.notificationService.notify(booking.customerId, booking.customerProfileId, 'BOOKING_CANCELLED', 'Booking was cancelled', `Your ${booking.serviceType} booking was cancelled by the ${cancelledBy}`, { bookingId, reason: dto.reason }),
            this.notificationService.notify(booking.providerId, booking.providerProfileId, 'BOOKING_CANCELLED', 'Booking was cancelled', `A ${booking.serviceType} booking was cancelled by the ${cancelledBy}`, { bookingId, reason: dto.reason }),
        ]);
        return {
            id: updated.id,
            status: updated.status,
            cancelledAt: updated.cancelledAt,
            updatedAt: updated.updatedAt,
        };
    }
    async disputeBooking(bookingId, userId, dto) {
        const profile = await this.validator.getUserProfile(userId);
        const booking = await this.validator.validateBookingAccess(bookingId, profile.id);
        this.validator.validateStatusTransition(booking.status, client_1.BookingStatus.DISPUTED, 'dispute');
        const updated = await this.prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: client_1.BookingStatus.DISPUTED,
                disputeReason: dto.reason,
                disputeDescription: dto.description,
            },
        });
        this.logger.log(`Booking disputed: id=${bookingId} by=${profile.id} ${booking.status}→DISPUTED reason="${dto.reason}"`);
        await this.invalidateBookingCaches(booking);
        await this.trustService.recalculate(booking.providerProfileId);
        await Promise.all([
            this.notificationService.notify(booking.customerId, booking.customerProfileId, 'BOOKING_DISPUTED', 'A dispute was raised', `A dispute was raised on your ${booking.serviceType} booking`, { bookingId, reason: dto.reason }),
            this.notificationService.notify(booking.providerId, booking.providerProfileId, 'BOOKING_DISPUTED', 'A dispute was raised', `A dispute was raised on your ${booking.serviceType} booking`, { bookingId, reason: dto.reason }),
        ]);
        return {
            id: updated.id,
            status: updated.status,
            disputeReason: updated.disputeReason,
            updatedAt: updated.updatedAt,
        };
    }
    async submitReview(bookingId, userId, dto) {
        const profile = await this.validator.getUserProfile(userId);
        const booking = await this.validator.validateBookingAccess(bookingId, profile.id);
        this.validator.validateIsCustomer(booking.customerProfileId, profile.id);
        if (booking.status !== client_1.BookingStatus.COMPLETED) {
            throw new common_1.ConflictException('Can only review a completed booking');
        }
        const existingReview = await this.prisma.review.findUnique({
            where: { bookingId },
        });
        if (existingReview) {
            throw new common_1.ConflictException('You have already reviewed this booking');
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
        this.logger.log(`Review submitted: reviewId=${review.id} bookingId=${bookingId} rating=${dto.rating} provider=${booking.providerProfileId}`);
        await this.invalidateBookingCaches(booking);
        await this.trustService.recalculate(booking.providerProfileId);
        await this.notificationService.notify(booking.providerId, booking.providerProfileId, 'REVIEW_RECEIVED', 'You received a new review', `You received a ${dto.rating}-star review for your ${booking.serviceType} service`, { bookingId, reviewId: review.id, rating: dto.rating });
        return {
            id: review.id,
            bookingId: review.bookingId,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
        };
    }
    async invalidateBookingCaches(booking) {
        try {
            await this.redis.del(`booking:${booking.id}`);
            const client = this.redis.getClient();
            const customerKeys = await client.keys(`bookings:customer:${booking.customerProfileId}:*`);
            if (customerKeys.length > 0) {
                await client.del(...customerKeys);
            }
            const providerKeys = await client.keys(`bookings:provider:${booking.providerProfileId}:*`);
            if (providerKeys.length > 0) {
                await client.del(...providerKeys);
            }
            this.logger.debug(`Cache invalidated for booking ${booking.id}: ${customerKeys.length + providerKeys.length + 1} keys`);
        }
        catch (error) {
            this.logger.warn(`Cache invalidation failed for booking ${booking.id}`, error);
        }
    }
};
exports.BookingService = BookingService;
exports.BookingService = BookingService = BookingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)(notification_interface_1.NOTIFICATION_SERVICE)),
    __param(4, (0, common_1.Inject)(trust_interface_1.TRUST_SERVICE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        booking_validator_1.BookingValidator, Object, Object])
], BookingService);
//# sourceMappingURL=booking.service.js.map