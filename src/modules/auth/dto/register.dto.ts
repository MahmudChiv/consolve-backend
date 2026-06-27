import { ApiProperty } from '@nestjs/swagger';
import {
  IsPhoneNumber,
  IsString,
  IsStrongPassword,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'User phone number in E.164 format',
    example: '+2348012345678',
  })
  @IsPhoneNumber()
  phoneNumber: string;

  @ApiProperty({
    description:
      'Strong password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 symbol)',
    example: 'MyStr0ng!Pass',
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
  password: string;
}
