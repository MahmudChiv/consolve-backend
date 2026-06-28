import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { DisputeBookingDto } from './dto/dispute-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
export declare class BookingController {
    private readonly bookingService;
    constructor(bookingService: BookingService);
    createBooking(user: JwtPayload, dto: CreateBookingDto): Promise<Record<string, unknown>>;
    getMyHires(user: JwtPayload, query: BookingQueryDto): Promise<Record<string, unknown>>;
    getMyJobs(user: JwtPayload, query: BookingQueryDto): Promise<Record<string, unknown>>;
    getBookingById(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    acceptBooking(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    completeBooking(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    cancelBooking(user: JwtPayload, id: string, dto: CancelBookingDto): Promise<Record<string, unknown>>;
    disputeBooking(user: JwtPayload, id: string, dto: DisputeBookingDto): Promise<Record<string, unknown>>;
    submitReview(user: JwtPayload, id: string, dto: ReviewBookingDto): Promise<Record<string, unknown>>;
}
