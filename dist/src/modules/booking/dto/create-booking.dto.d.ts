import { BookingType } from '@prisma/client';
export declare class CreateBookingDto {
    providerProfileId: string;
    serviceType: string;
    description?: string;
    bookingType: BookingType;
    scheduledAt?: string;
    priceAgreed?: number;
    currency?: string;
    locationAddress?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
}
