export declare enum OnboardingMode {
    TEXT = "text",
    VOICE = "voice"
}
export declare class ChatMessageDto {
    message: string;
    mode?: OnboardingMode;
}
