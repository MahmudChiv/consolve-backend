/**
 * onboarding-session.service.ts
 *
 * Redis-backed session store for the AI onboarding conversation.
 *
 * Key pattern : onboarding:session:<userProfileId>
 * TTL         : 7 days — users can leave and resume without losing progress.
 *
 * The session JSON stores:
 *  - conversationHistory  — full turns fed back to Gemini for context
 *  - identityState        — fields collected so far (live-updated after each answer)
 *  - currentStep          — which question we are on (0–5)
 *  - lastMode             — text | voice (for mode-switch resume)
 */
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import type {
  OnboardingSession,
} from '../interfaces/onboarding-session.interface';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const KEY = (profileId: string) => `onboarding:session:${profileId}`;

@Injectable()
export class OnboardingSessionService {
  private readonly logger = new Logger(OnboardingSessionService.name);

  constructor(private readonly redisService: RedisService) {}

  /** Load an existing session from Redis, or null if it does not exist. */
  async get(userProfileId: string): Promise<OnboardingSession | null> {
    const raw = await this.redisService.get(KEY(userProfileId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OnboardingSession;
    } catch {
      this.logger.warn(`Corrupt session for profile ${userProfileId} — discarding`);
      await this.del(userProfileId);
      return null;
    }
  }

  /** Persist (create or overwrite) a session with a fresh 7-day TTL. */
  async save(session: OnboardingSession): Promise<void> {
    await this.redisService.set(
      KEY(session.userProfileId),
      JSON.stringify(session),
      SESSION_TTL_SECONDS,
    );
  }

  /** Create a brand-new session for a user starting onboarding. */
  async create(
    userProfileId: string,
    userId: string,
    firstName: string,
  ): Promise<OnboardingSession> {
    const session: OnboardingSession = {
      userProfileId,
      userId,
      firstName,
      currentStep: 0,
      identityState: {},
      conversationHistory: [],
      lastMode: 'text',
      lastActiveAt: new Date().toISOString(),
    };
    await this.save(session);
    this.logger.log(`New onboarding session created for profile ${userProfileId}`);
    return session;
  }

  /** Remove the session once onboarding is fully completed. */
  async del(userProfileId: string): Promise<void> {
    await this.redisService.del(KEY(userProfileId));
  }
}
