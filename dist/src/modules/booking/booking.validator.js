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
var BookingValidator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingValidator = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../common/prisma/prisma.service");
let BookingValidator = BookingValidator_1 = class BookingValidator {
    prisma;
    logger = new common_1.Logger(BookingValidator_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async validateCreateBooking(userId, providerProfileId, bookingType, scheduledAt) {
        const customerProfile = await this.prisma.userProfile.findFirst({
            where: { userId },
            select: { id: true, userId: true },
        });
        if (!customerProfile) {
            throw new common_1.NotFoundException('Customer profile not found. Please complete your profile first.');
        }
        const providerProfile = await this.prisma.userProfile.findUnique({
            where: { id: providerProfileId },
            select: { id: true, userId: true, onboardingStatus: true },
        });
        if (!providerProfile) {
            throw new common_1.NotFoundException('Provider profile not found');
        }
        if (providerProfile.onboardingStatus !== client_1.OnboardingStatus.COMPLETED) {
            throw new common_1.BadRequestException('Provider has not completed onboarding');
        }
        if (customerProfile.id === providerProfileId) {
            throw new common_1.BadRequestException('You cannot book yourself');
        }
        if (bookingType === client_1.BookingType.SCHEDULED) {
            if (!scheduledAt) {
                throw new common_1.BadRequestException('scheduledAt is required for SCHEDULED bookings');
            }
            const scheduledDate = new Date(scheduledAt);
            if (scheduledDate <= new Date()) {
                throw new common_1.BadRequestException('scheduledAt must be in the future');
            }
        }
        this.logger.debug(`Booking validation passed: customer=${customerProfile.id} provider=${providerProfileId}`);
        return { customerProfile, providerProfile };
    }
    async validateBookingAccess(bookingId, userProfileId) {
        const booking = await this.prisma.booking.findUnique({
            where: { id: bookingId },
        });
        if (!booking) {
            throw new common_1.NotFoundException('Booking not found');
        }
        if (booking.customerProfileId !== userProfileId &&
            booking.providerProfileId !== userProfileId) {
            throw new common_1.ForbiddenException('You do not have access to this booking');
        }
        return booking;
    }
    validateStatusTransition(currentStatus, targetStatus, action) {
        const allowedTransitions = {
            accept: [client_1.BookingStatus.PENDING],
            complete: [client_1.BookingStatus.ACCEPTED, client_1.BookingStatus.IN_PROGRESS],
            cancel: [client_1.BookingStatus.PENDING, client_1.BookingStatus.ACCEPTED],
            dispute: [client_1.BookingStatus.ACCEPTED, client_1.BookingStatus.IN_PROGRESS, client_1.BookingStatus.COMPLETED],
        };
        const allowed = allowedTransitions[action];
        if (!allowed || !allowed.includes(currentStatus)) {
            throw new common_1.BadRequestException(`Cannot ${action} a booking with status ${currentStatus}`);
        }
    }
    validateIsProvider(bookingProviderProfileId, userProfileId) {
        if (bookingProviderProfileId !== userProfileId) {
            throw new common_1.ForbiddenException('Only the provider can perform this action');
        }
    }
    validateIsCustomer(bookingCustomerProfileId, userProfileId) {
        if (bookingCustomerProfileId !== userProfileId) {
            throw new common_1.ForbiddenException('Only the customer can perform this action');
        }
    }
    async getUserProfile(userId) {
        const profile = await this.prisma.userProfile.findFirst({
            where: { userId },
            select: { id: true, userId: true },
        });
        if (!profile) {
            throw new common_1.NotFoundException('User profile not found');
        }
        return profile;
    }
};
exports.BookingValidator = BookingValidator;
exports.BookingValidator = BookingValidator = BookingValidator_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BookingValidator);
//# sourceMappingURL=booking.validator.js.map