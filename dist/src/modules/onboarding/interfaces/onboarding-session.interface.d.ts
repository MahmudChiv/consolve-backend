export interface IdentityState {
    profession?: string;
    expertise?: string;
    availability?: string;
    experience?: string;
    pricing?: string;
    summary?: string;
}
export interface ConversationTurn {
    role: 'model' | 'user';
    content: string;
}
export interface OnboardingSession {
    userProfileId: string;
    userId: string;
    firstName: string;
    currentStep: number;
    identityState: IdentityState;
    conversationHistory: ConversationTurn[];
    lastMode: 'text' | 'voice';
    lastActiveAt: string;
}
