import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiProperty({ example: 'Changed my mind' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}