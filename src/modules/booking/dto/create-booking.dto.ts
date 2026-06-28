import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { BookingType } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ description: 'Provider UserProfile ID' })
  @IsUUID()
  @IsNotEmpty()
  providerProfileId: string;

  @ApiProperty({ example: 'Tailoring' })
  @IsString()
  @IsNotEmpty()
  serviceType: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: BookingType, default: BookingType.HIRE_NOW })
  @IsEnum(BookingType)
  bookingType: BookingType;

  @ApiPropertyOptional({ description: 'Required when bookingType is SCHEDULED' })
  @IsDateString()
  @IsOptional()
  @ValidateIf((o) => o.bookingType === BookingType.SCHEDULED)
  @IsNotEmpty({ message: 'scheduledAt is required when bookingType is SCHEDULED' })
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  priceAgreed?: number;

  @ApiPropertyOptional({ default: 'NGN' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationAddress?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}