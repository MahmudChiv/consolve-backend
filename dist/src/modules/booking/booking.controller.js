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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const client_1 = require("@prisma/client");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const token_blacklist_guard_1 = require("../common/guards/token-blacklist.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const booking_service_1 = require("./booking.service");
const create_booking_dto_1 = require("./dto/create-booking.dto");
const cancel_booking_dto_1 = require("./dto/cancel-booking.dto");
const dispute_booking_dto_1 = require("./dto/dispute-booking.dto");
const review_booking_dto_1 = require("./dto/review-booking.dto");
const booking_query_dto_1 = require("./dto/booking-query.dto");
let BookingController = class BookingController {
    bookingService;
    constructor(bookingService) {
        this.bookingService = bookingService;
    }
    async createBooking(user, dto) {
        const data = await this.bookingService.createBooking(user.sub, dto);
        return {
            success: true,
            message: 'Booking request sent successfully',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async getMyHires(user, query) {
        const data = await this.bookingService.getMyHires(user.sub, query);
        return {
            success: true,
            message: 'Bookings retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async getMyJobs(user, query) {
        const data = await this.bookingService.getMyJobs(user.sub, query);
        return {
            success: true,
            message: 'Bookings retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async getBookingById(user, id) {
        const data = await this.bookingService.getBookingById(id, user.sub);
        return {
            success: true,
            message: 'Booking retrieved',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async acceptBooking(user, id) {
        const data = await this.bookingService.acceptBooking(id, user.sub);
        return {
            success: true,
            message: 'Booking accepted',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async completeBooking(user, id) {
        const data = await this.bookingService.completeBooking(id, user.sub);
        return {
            success: true,
            message: 'Booking completed',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async cancelBooking(user, id, dto) {
        const data = await this.bookingService.cancelBooking(id, user.sub, dto);
        return {
            success: true,
            message: 'Booking cancelled',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async disputeBooking(user, id, dto) {
        const data = await this.bookingService.disputeBooking(id, user.sub, dto);
        return {
            success: true,
            message: 'Dispute raised successfully',
            data,
            timestamp: new Date().toISOString(),
        };
    }
    async submitReview(user, id, dto) {
        const data = await this.bookingService.submitReview(id, user.sub, dto);
        return {
            success: true,
            message: 'Review submitted successfully',
            data,
            timestamp: new Date().toISOString(),
        };
    }
};
exports.BookingController = BookingController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Create a new booking',
        description: `
Creates a booking request from the authenticated customer to a provider.
The customerProfileId is extracted from the JWT — it cannot be supplied in the body.

**Rules:**
- Cannot book yourself
- Provider must have completed onboarding
- If bookingType is SCHEDULED, scheduledAt must be provided and in the future
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({ type: create_booking_dto_1.CreateBookingDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Booking created successfully',
        schema: {
            example: {
                success: true,
                message: 'Booking request sent successfully',
                data: {
                    id: 'uuid',
                    providerProfileId: 'uuid',
                    customerProfileId: 'uuid',
                    serviceType: 'Tailoring',
                    status: 'PENDING',
                    bookingType: 'HIRE_NOW',
                    priceAgreed: 25000,
                    currency: 'NGN',
                    createdAt: '2026-06-28T...',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Validation error or business rule violation' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Provider profile not found' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_booking_dto_1.CreateBookingDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "createBooking", null);
__decorate([
    (0, common_1.Get)('my-hires'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get bookings as a customer (my hires)',
        description: 'Returns paginated bookings where the authenticated user is the customer. ' +
            'Optionally filter by status. Results are cached in Redis for 2 minutes.',
    }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: client_1.BookingStatus }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 10 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Customer bookings retrieved',
        schema: {
            example: {
                success: true,
                message: 'Bookings retrieved',
                data: {
                    bookings: [],
                    pagination: { page: 1, limit: 10, total: 24, totalPages: 3 },
                    cached: false,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, booking_query_dto_1.BookingQueryDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "getMyHires", null);
__decorate([
    (0, common_1.Get)('my-jobs'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get bookings as a provider (my jobs)',
        description: 'Returns paginated bookings where the authenticated user is the provider. ' +
            'Optionally filter by status. Results are cached in Redis for 2 minutes.',
    }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: client_1.BookingStatus }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 10 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Provider bookings retrieved',
        schema: {
            example: {
                success: true,
                message: 'Bookings retrieved',
                data: {
                    bookings: [],
                    pagination: { page: 1, limit: 10, total: 5, totalPages: 1 },
                    cached: false,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Rate limit exceeded' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, booking_query_dto_1.BookingQueryDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "getMyJobs", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Get booking details by ID',
        description: 'Returns full booking detail. Only accessible by the customer or provider on the booking. ' +
            'Cached in Redis for 5 minutes.',
    }),
    (0, swagger_1.ApiParam)({
        name: 'id',
        description: 'Booking UUID',
        example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Booking detail retrieved' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Not a participant on this booking' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Booking not found' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "getBookingById", null);
__decorate([
    (0, common_1.Patch)(':id/accept'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Accept a booking (provider only)',
        description: 'Provider accepts a PENDING booking. Status transitions to ACCEPTED. ' +
            'Customer is notified.',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Booking UUID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Booking accepted',
        schema: {
            example: {
                success: true,
                message: 'Booking accepted',
                data: { id: 'uuid', status: 'ACCEPTED', updatedAt: '2026-06-28T...' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid status transition' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Only provider can accept' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Booking not found' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "acceptBooking", null);
__decorate([
    (0, common_1.Patch)(':id/complete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Complete a booking (either party)',
        description: 'Marks an ACCEPTED or IN_PROGRESS booking as COMPLETED. ' +
            'Triggers trust score recalculation and notifies the customer.',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Booking UUID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Booking completed',
        schema: {
            example: {
                success: true,
                message: 'Booking completed',
                data: {
                    id: 'uuid',
                    status: 'COMPLETED',
                    completedAt: '2026-06-28T...',
                    updatedAt: '2026-06-28T...',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid status transition' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Booking not found' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "completeBooking", null);
__decorate([
    (0, common_1.Patch)(':id/cancel'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Cancel a booking (either party)',
        description: 'Cancels a PENDING or ACCEPTED booking. Both parties are notified. ' +
            'A reason must be provided.',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Booking UUID' }),
    (0, swagger_1.ApiBody)({ type: cancel_booking_dto_1.CancelBookingDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Booking cancelled',
        schema: {
            example: {
                success: true,
                message: 'Booking cancelled',
                data: {
                    id: 'uuid',
                    status: 'CANCELLED',
                    cancelledAt: '2026-06-28T...',
                    updatedAt: '2026-06-28T...',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid status transition' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Booking not found' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, cancel_booking_dto_1.CancelBookingDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "cancelBooking", null);
__decorate([
    (0, common_1.Patch)(':id/dispute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Dispute a booking (either party)',
        description: 'Raises a dispute on an ACCEPTED, IN_PROGRESS, or COMPLETED booking. ' +
            'Both parties are notified and a trust penalty is applied. ' +
            'Resolution is manual for hackathon scope.',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Booking UUID' }),
    (0, swagger_1.ApiBody)({ type: dispute_booking_dto_1.DisputeBookingDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Dispute raised',
        schema: {
            example: {
                success: true,
                message: 'Dispute raised successfully',
                data: {
                    id: 'uuid',
                    status: 'DISPUTED',
                    disputeReason: 'Provider did not show up',
                    updatedAt: '2026-06-28T...',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid status transition' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Booking not found' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dispute_booking_dto_1.DisputeBookingDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "disputeBooking", null);
__decorate([
    (0, common_1.Post)(':id/review'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, throttler_1.Throttle)({ default: { limit: 10, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Submit a review (customer only)',
        description: 'Submits a star rating (1-5) and optional comment for a COMPLETED booking. ' +
            'Only the customer can review. One review per booking. ' +
            'Triggers trust score recalculation and notifies the provider.',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'Booking UUID' }),
    (0, swagger_1.ApiBody)({ type: review_booking_dto_1.ReviewBookingDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: 'Review submitted',
        schema: {
            example: {
                success: true,
                message: 'Review submitted successfully',
                data: {
                    id: 'uuid',
                    bookingId: 'uuid',
                    rating: 5,
                    comment: 'Excellent work, very professional',
                    createdAt: '2026-06-28T...',
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Booking not in COMPLETED status' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Only customer can review' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Review already submitted' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, review_booking_dto_1.ReviewBookingDto]),
    __metadata("design:returntype", Promise)
], BookingController.prototype, "submitReview", null);
exports.BookingController = BookingController = __decorate([
    (0, swagger_1.ApiTags)('Bookings'),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, common_1.Controller)('bookings'),
    __metadata("design:paramtypes", [booking_service_1.BookingService])
], BookingController);
//# sourceMappingURL=booking.controller.js.map