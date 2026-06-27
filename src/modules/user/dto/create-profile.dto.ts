/**
 * update-profile.dto.ts
 *
 * Data Transfer Object for POST /user/updateProfile.
 *
 * The `types` field is an array, enabling multi-profile creation in a single
 * request. For example, a user who is both a CUSTOMER and a SERVICE_PROVIDER
 * submits: types: ["CUSTOMER", "SERVICE_PROVIDER"]
 *
 * The UserService will create one UserProfile row per type.
 *
 * All fields are validated by class-validator via the global ValidationPipe.
 * Invalid requests are rejected with HTTP 400 before reaching the service.
 */
import { ApiProperty } from '@nestjs/swagger';
import { UserType, Gender } from '@prisma/client';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    description: 'User first name (minimum 2 characters)',
    example: 'John',
  })
  @IsString()
  @MinLength(2)
  firstName: string;

  @ApiProperty({
    description: 'User last name (minimum 2 characters)',
    example: 'Doe',
  })
  @IsString()
  @MinLength(2)
  lastName: string;

  @ApiProperty({
    enum: Gender,
    description: 'Gender enum — MALE or FEMALE',
    example: Gender.MALE,
  })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({
    enum: UserType,
    isArray: true,
    description:
      'One or more user types. A separate UserProfile row is created per type. ' +
      'Duplicate types are ignored.',
    example: [UserType.CUSTOMER, UserType.SERVICE_PROVIDER],
  })
  @IsArray()
  @ArrayMinSize(1)          // At least one type must be selected
  @ArrayUnique()            // Prevent duplicate types in the request
  @IsEnum(UserType, { each: true }) // Each element must be a valid UserType enum value
  types: UserType[];
}
