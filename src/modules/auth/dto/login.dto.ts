/**
 * login.dto.ts
 *
 * DTO for POST /auth/login.
 * Email + password — no OTP required on login.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Account password',
    example: 'MyStr0ng!Pass',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
