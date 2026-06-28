/**
 * onboarding.module.ts
 *
 * NestJS module for the AI onboarding feature.
 *
 * Provides:
 *  - OnboardingController (HTTP: SSE chat + location PATCH)
 *  - OnboardingGateway   (WebSocket: voice chat pipeline)
 *  - OnboardingService   (Gemini conversation engine)
 *  - OnboardingSessionService (Redis session store)
 */
import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingGateway } from './onboarding.gateway';
import { OnboardingService } from './onboarding.service';
import { OnboardingSessionService } from './session/onboarding-session.service';

@Module({
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingSessionService,
    OnboardingGateway,
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
