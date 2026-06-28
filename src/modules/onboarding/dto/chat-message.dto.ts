/**
 * chat-message.dto.ts
 *
 * DTO for the POST /user/onboarding text chat body.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export enum OnboardingMode {
  TEXT = 'text',
  VOICE = 'voice',
}

export class ChatMessageDto {
  @ApiProperty({
    description: 'The user\'s message to the AI',
    example: 'I am a software engineer',
  })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({
    enum: OnboardingMode,
    description: 'Communication mode — text (SSE) or voice (WebSocket). Defaults to text.',
    example: OnboardingMode.TEXT,
  })
  @IsOptional()
  @IsEnum(OnboardingMode)
  mode?: OnboardingMode = OnboardingMode.TEXT;
}
