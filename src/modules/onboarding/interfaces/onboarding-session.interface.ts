/**
 * onboarding-session.interface.ts
 *
 * Defines the shape of the onboarding session stored in Redis.
 * Key pattern: onboarding:session:<userProfileId>
 * TTL: 7 days — allows users to leave and resume later.
 */

/** The five structured data fields collected during onboarding */
export interface IdentityState {
  profession?: string;
  expertise?: string;
  availability?: string;
  experience?: string;
  pricing?: string;
  summary?: string;
}

/** A single turn in the conversation history (for Gemini context) */
export interface ConversationTurn {
  role: 'model' | 'user';
  content: string;
}

/**
 * Full session document persisted in Redis.
 * `currentStep` tracks where in the question flow the user is:
 *   0 = profession, 1 = expertise, 2 = availability, 3 = experience, 4 = pricing, 5 = summary/done
 */
export interface OnboardingSession {
  userProfileId: string;
  userId: string;
  firstName: string;
  currentStep: number;
  identityState: IdentityState;
  conversationHistory: ConversationTurn[];
  /** 'text' | 'voice' — last used mode, for mode-switch resume */
  lastMode: 'text' | 'voice';
  /** ISO timestamp of when the session was last touched */
  lastActiveAt: string;
}
