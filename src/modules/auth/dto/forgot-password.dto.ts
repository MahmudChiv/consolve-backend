/**
 * forgot-password.dto.ts
 *
 * DTO for POST /auth/forgotPassword — initiates a password reset flow.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address linked to the account',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
