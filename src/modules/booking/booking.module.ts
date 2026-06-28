/**
 * booking.module.ts
 *
 * NestJS module for the Booking feature.
 *
 * Wires up:
 *  - BookingController (HTTP layer)
 *  - BookingService (business logic)
 *  - BookingValidator (domain validation)
 *  - NotificationMockService → NOTIFICATION_SERVICE token
 *  - TrustMockService → TRUST_SERVICE token
 *
 * Mock services use provider tokens so swapping to real
 * implementations requires zero changes to this module —
 * just replace the `useClass` value.
 *
 * Exports BookingService so TrustService (future) can import it.
 */
import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { NotificationMockService } from './mocks/notification.mock.service';
import { TrustMockService } from './mocks/trust.mock.service';
import { NOTIFICATION_SERVICE } from './interfaces/notification.interface';
import { TRUST_SERVICE } from './interfaces/trust.interface';

@Module({
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingValidator,
    {
      provide: NOTIFICATION_SERVICE,
      useClass: NotificationMockService,
    },
    {
      provide: TRUST_SERVICE,
      useClass: TrustMockService,
    },
  ],
  exports: [BookingService],
})
export class BookingModule {}
