import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingValidator } from './booking.validator';
import { NotificationMockService } from './mocks/notification.mock.service';
import { NOTIFICATION_SERVICE } from './interfaces/notification.interface';
import { TRUST_SERVICE } from './interfaces/trust.interface';
import { TrustModule } from '../trust/trust.module';
import { TrustService } from '../trust/trust.service';
import { NotificationModule } from '../notification/notification.module';
import { NotificationService } from '../notification/notification.service';

@Module({
  imports: [TrustModule, NotificationModule],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingValidator,
    {
      provide: NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
    {
      provide: TRUST_SERVICE,
      useExisting: TrustService,
    },
  ],
  exports: [BookingService],
})
export class BookingModule {}
