/**
 * update-location.dto.ts
 *
 * DTO for PATCH /user/onboarding — adds the user's GPS location and finalises onboarding.
 * latitude/longitude are now Float in the DB, so we accept numbers here.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateLocationDto {
  @ApiProperty({ description: 'GPS latitude (decimal degrees)', example: 6.5244 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ description: 'GPS longitude (decimal degrees)', example: 3.3792 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude: number;

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
