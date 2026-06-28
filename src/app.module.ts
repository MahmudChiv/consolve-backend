import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import configuration from './config/configuration';
import { validationSchema } from './config/env.validation';
import { PrismaModule } from './modules/common/prisma/prisma.module';
import { RedisModule } from './modules/common/redis/redis.module';
import { MailModule } from './modules/common/mail/mail.module';
import { RequestLoggerMiddleware } from './modules/common/logger/request-logger.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { HealthModule } from './modules/health/health.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SearchModule } from './modules/search/search.module';
import { BookingModule } from './modules/booking/booking.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),

    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 60 }],
    }),
    TerminusModule,
    PrismaModule,
    RedisModule,
    MailModule,
    AuthModule,
    UserModule,
    HealthModule,
    OnboardingModule,
    SearchModule,
    BookingModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * Apply the structured request logger middleware to all routes.
   * This runs before any guard or interceptor, so it captures
   * both successful and rejected requests.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
