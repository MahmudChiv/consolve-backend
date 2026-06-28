/**
 * update-location.dto.ts
 *
 * DTO for PATCH /user/onboarding — adds the user's location and finalises onboarding.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateLocationDto {
  @ApiProperty({ description: 'GPS latitude as string', example: '6.5244' })
  @IsString()
  latitude: string;

  @ApiProperty({ description: 'GPS longitude as string', example: '3.3792' })
  @IsString()
  longitude: string;

  @ApiPropertyOptional({ description: 'City name', example: 'Lagos' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  city?: string;

  @ApiPropertyOptional({ description: 'State / province', example: 'Lagos State' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Country name', example: 'Nigeria' })
  @IsOptional()
  @IsString()
  country?: string;
}
