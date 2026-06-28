import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisputeBookingDto {
  @ApiProperty({ example: 'Provider did not show up' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @ApiProperty({ example: 'Full description of what happened' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;
}