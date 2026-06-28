import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { BookingValidator } from './booking.validator';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { DisputeBookingDto } from './dto/dispute-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import type { INotificationService } from './interfaces/notification.interface';
import type { ITrustService } from './interfaces/trust.interface';
export declare class BookingService {
    private readonly prisma;
    private readonly redis;
    private readonly validator;
    private readonly notificationService;
    private readonly trustService;
    private readonly logger;
    constructor(prisma: PrismaService, redis: RedisService, validator: BookingValidator, notificationService: INotificationService, trustService: ITrustService);
    createBooking(userId: string, dto: CreateBookingDto): Promise<{
        id: string;
        providerProfileId: string;
        customerProfileId: string;
        serviceType: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        bookingType: import("@prisma/client").$Enums.BookingType;
        priceAgreed: number | null;
        currency: string;
        createdAt: Date;
    }>;
    getMyHires(userId: string, query: BookingQueryDto): Promise<any>;
    getMyJobs(userId: string, query: BookingQueryDto): Promise<any>;
    getBookingById(bookingId: string, userId: string): Promise<any>;
    acceptBooking(bookingId: string, userId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        updatedAt: Date;
    }>;
    completeBooking(bookingId: string, userId: string): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        completedAt: Date | null;
        updatedAt: Date;
    }>;
    cancelBooking(bookingId: string, userId: string, dto: CancelBookingDto): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        cancelledAt: Date | null;
        updatedAt: Date;
    }>;
    disputeBooking(bookingId: string, userId: string, dto: DisputeBookingDto): Promise<{
        id: string;
        status: import("@prisma/client").$Enums.BookingStatus;
        disputeReason: string | null;
        updatedAt: Date;
    }>;
    submitReview(bookingId: string, userId: string, dto: ReviewBookingDto): Promise<{
        id: string;
        bookingId: string;
        rating: number;
        comment: string | null;
        createdAt: Date;
    }>;
    private invalidateBookingCaches;
}
