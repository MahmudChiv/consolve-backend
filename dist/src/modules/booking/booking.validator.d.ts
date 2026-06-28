import { BookingStatus, BookingType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
export declare class BookingValidator {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    validateCreateBooking(userId: string, providerProfileId: string, bookingType: BookingType, scheduledAt?: string): Promise<{
        customerProfile: {
            id: string;
            userId: string;
        };
        providerProfile: {
            id: string;
            userId: string;
        };
    }>;
    validateBookingAccess(bookingId: string, userProfileId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        latitude: number | null;
        longitude: number | null;
        currency: string;
        description: string | null;
        customerId: string;
        customerProfileId: string;
        providerId: string;
        providerProfileId: string;
        serviceType: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        bookingType: import("@prisma/client").$Enums.BookingType;
        scheduledAt: Date | null;
        priceAgreed: import("@prisma/client-runtime-utils").Decimal | null;
        locationAddress: string | null;
        notes: string | null;
        disputeReason: string | null;
        disputeDescription: string | null;
        completedAt: Date | null;
        cancelledAt: Date | null;
        cancelReason: string | null;
    }>;
    validateStatusTransition(currentStatus: BookingStatus, targetStatus: BookingStatus, action: string): void;
    validateIsProvider(bookingProviderProfileId: string, userProfileId: string): void;
    validateIsCustomer(bookingCustomerProfileId: string, userProfileId: string): void;
    getUserProfile(userId: string): Promise<{
        id: string;
        userId: string;
    }>;
}
