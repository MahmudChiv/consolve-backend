/**
 * login.dto.ts
 *
 * DTO for POST /auth/login.
 * Identical fields to RegisterDto — phone number + password.
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsPhoneNumber()
  phoneNumber: string;

  @ApiProperty({
    description: 'Account password',
    example: 'MyStr0ng!Pass',
  })
  @IsString()
  @MinLength(8)
  password: string;
}
