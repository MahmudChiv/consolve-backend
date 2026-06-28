/**
 * booking.validator.ts
 *
 * Business rule validation for booking operations.
 * This is NOT DTO validation (handled by class-validator decorators).
 * These are domain-level rules that require database lookups.
 *
 * Separated from BookingService to keep service methods focused
 * on orchestration while validation logic stays testable in isolation.
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, BookingType, OnboardingStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class BookingValidator {
  private readonly logger = new Logger(BookingValidator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates that a customer can create a booking for a given provider.
   *
   * Rules enforced:
   *  1. Customer must have a profile
   *  2. Provider profile must exist
   *  3. Provider must have completed onboarding
   *  4. Customer cannot book themselves
   *  5. If SCHEDULED, scheduledAt must be in the future
   */
  async validateCreateBooking(
    userId: string,
    providerProfileId: string,
    bookingType: BookingType,
    scheduledAt?: string,
  ): Promise<{
    customerProfile: { id: string; userId: string };
    providerProfile: { id: string; userId: string };
  }> {
    // 1. Get customer profile
    const customerProfile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { id: true, userId: true },
    });

    if (!customerProfile) {
      throw new NotFoundException('Customer profile not found. Please complete your profile first.');
    }

    // 2. Get provider profile
    const providerProfile = await this.prisma.userProfile.findUnique({
      where: { id: providerProfileId },
      select: { id: true, userId: true, onboardingStatus: true },
    });

    if (!providerProfile) {
      throw new NotFoundException('Provider profile not found');
    }

    // 3. Provider must have completed onboarding
    if (providerProfile.onboardingStatus !== OnboardingStatus.COMPLETED) {
      throw new BadRequestException('Provider has not completed onboarding');
    }

    // 4. Cannot book yourself
    if (customerProfile.id === providerProfileId) {
      throw new BadRequestException('You cannot book yourself');
    }

    // 5. Scheduled bookings must be in the future
    if (bookingType === BookingType.SCHEDULED) {
      if (!scheduledAt) {
        throw new BadRequestException('scheduledAt is required for SCHEDULED bookings');
      }

      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        throw new BadRequestException('scheduledAt must be in the future');
      }
    }

    this.logger.debug(
      `Booking validation passed: customer=${customerProfile.id} provider=${providerProfileId}`,
    );

    return { customerProfile, providerProfile };
  }

  /**
   * Validates that a booking exists and the user is a participant.
   * Returns the booking if valid.
   */
  async validateBookingAccess(
    bookingId: string,
    userProfileId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (
      booking.customerProfileId !== userProfileId &&
      booking.providerProfileId !== userProfileId
    ) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return booking;
  }

  /**
   * Validates a status transition is legal.
   */
  validateStatusTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
    action: string,
  ): void {
    const allowedTransitions: Record<string, BookingStatus[]> = {
      accept: [BookingStatus.PENDING],
      complete: [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS],
      cancel: [BookingStatus.PENDING, BookingStatus.ACCEPTED],
      dispute: [BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED],
    };

    const allowed = allowedTransitions[action];
    if (!allowed || !allowed.includes(currentStatus)) {
      throw new BadRequestException(
        `Cannot ${action} a booking with status ${currentStatus}`,
      );
    }
  }

  /**
   * Validates that the current user is the provider on the booking.
   */
  validateIsProvider(bookingProviderProfileId: string, userProfileId: string): void {
    if (bookingProviderProfileId !== userProfileId) {
      throw new ForbiddenException('Only the provider can perform this action');
    }
  }

  /**
   * Validates that the current user is the customer on the booking.
   */
  validateIsCustomer(bookingCustomerProfileId: string, userProfileId: string): void {
    if (bookingCustomerProfileId !== userProfileId) {
      throw new ForbiddenException('Only the customer can perform this action');
    }
  }

  /**
   * Finds the user profile for the authenticated user.
   * Throws NotFoundException if no profile exists.
   */
  async getUserProfile(userId: string) {
    const profile = await this.prisma.userProfile.findFirst({
      where: { userId },
      select: { id: true, userId: true },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return profile;
  }
}
