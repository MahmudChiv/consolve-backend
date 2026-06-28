/**
 * search.dto.ts
 *
 * DTOs for the Search module HTTP endpoints.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── POST /search ────────────────────────────────────────────────────────────

export class SearchDto {
  @ApiProperty({
    description: 'Natural language search query (English or Pidgin)',
    example: 'Find me a trusted tailor near Lagos who makes senator wear',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3, { message: 'Query must be at least 3 characters' })
  @MaxLength(500, { message: 'Query must be at most 500 characters' })
  query: string;

  @ApiPropertyOptional({
    description: "User's current latitude for distance calculation",
    example: 6.5244,
  })
  @IsOptional()
  @IsLatitude({ message: 'latitude must be a valid latitude (-90 to 90)' })
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({
    description: "User's current longitude for distance calculation",
    example: 3.3792,
  })
  @IsOptional()
  @IsLongitude({ message: 'longitude must be a valid longitude (-180 to 180)' })
  @Type(() => Number)
  longitude?: number;
}
