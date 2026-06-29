import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description:
      'Google ID token obtained from the frontend Google Sign-In SDK. ' +
      'Send this to the backend for server-side verification.',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  idToken: string;
}
