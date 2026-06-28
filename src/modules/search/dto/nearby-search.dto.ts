/**
 * nearby-search.dto.ts
 *
 * Query params DTO for GET /search/nearby
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NearbySearchDto {
  @ApiProperty({
    description: "Searcher's latitude",
    example: 6.5244,
  })
  @IsLatitude({ message: 'latitude must be a valid latitude (-90 to 90)' })
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: "Searcher's longitude",
    example: 3.3792,
  })
  @IsLongitude({ message: 'longitude must be a valid longitude (-180 to 180)' })
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Search radius in kilometres (default 10, max 100)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  radius?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by profession (optional)',
    example: 'tailor',
  })
  @IsOptional()
  @IsString()
  profession?: string;
}
