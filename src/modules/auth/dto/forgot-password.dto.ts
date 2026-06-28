/**
 * forgot-password.dto.ts
 *
 * DTO for POST /auth/forgotPassword — initiates a password reset flow.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Phone number linked to the account (E.164 format)',
    example: '+2348012345678',
  })
  @IsPhoneNumber()
  phoneNumber: string;
}
