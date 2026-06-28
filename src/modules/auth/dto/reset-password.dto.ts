/**
 * reset-password.dto.ts
 *
 * DTO for PATCH /auth/resetPassword — verifies OTP and sets a new password.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsStrongPassword,
  Length,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: '6-digit OTP sent to the user\'s phone',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiProperty({
    description:
      'New password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol)',
    example: 'NewStr0ng!Pass',
  })
  @IsString()
  @MinLength(8)
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    },
  )
  newPassword: string;
}
