import { BookingStatus } from '@prisma/client';
export declare class BookingQueryDto {
    status?: BookingStatus;
    page?: number;
    limit?: number;
}
