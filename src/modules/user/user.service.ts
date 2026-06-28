/**
 * user.service.ts
 *
 * Business logic for user profile creation.
 *
 * Key design decisions:
 *
 * 1. Multi-profile support
 *    A single User can have multiple UserProfile rows, one per type
 *    (SERVICE_PROVIDER, TRADER, CUSTOMER). This is modelled as a 1:N
 *    relationship — User → UserProfile — rather than an enum array on User.
 *    Each profile is independent and can hold type-specific data in the future.
 *
 * 2. Idempotency
 *    If a profile of the requested type already exists for the user, it is
 *    returned as-is instead of throwing an error. This makes the endpoint safe
 *    to call multiple times without creating duplicate rows.
 *
 * 3. Verification gate
 *    Profile creation is blocked until the user has verified their phone number
 *    (isVerified = true). This prevents spam registrations from polluting
 *    the profiles table.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prismaService: PrismaService) { }

  /**
   * Create one UserProfile row per requested type.
   *
   * If the user already has a profile of a given type, that existing profile
   * is returned without modification (idempotent behaviour).
   *
   * @param userId The authenticated user's UUID (from JWT payload)
   * @param dto    Profile data including the array of desired types
   * @returns      All newly created (and any already-existing) profiles
   */
  async createProfile(
    userId: string,
    dto: CreateProfileDto,
  ): Promise<UserProfile[]> {
    // Guard: user must exist and not be soft-deleted
    const user = await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Guard: phone must be verified before profile creation is allowed
    if (!user.isVerified) {
      throw new BadRequestException(
        'Account is not verified. Please verify your phone number first.',
      );
    }

    const { firstName, lastName, gender, types, avatarUrl } = dto;
    const createdProfiles: UserProfile[] = [];

    for (const type of types) {
      // Check for an existing profile with this userId + type combination
      // (@@unique([userId, type]) in the Prisma schema enforces this at DB level too)
      const existing = await this.prismaService.userProfile.findUnique({
        where: { userId_type: { userId, type } },
      });

      if (existing) {
        // Return the existing profile rather than throwing — makes the call idempotent
        this.logger.warn(
          `UserProfile of type ${type} already exists for user ${userId} — skipping creation`,
        );
        createdProfiles.push(existing);
        continue;
      }

      // Create a new profile row for this type
      const profile = await this.prismaService.userProfile.create({
        data: {
          userId,
          firstName,
          lastName,
          gender,
          type,
          ...(avatarUrl && { avatarUrl }),
        },
      });

      createdProfiles.push(profile);
      this.logger.log(`Created UserProfile type=${type} for user=${userId}`);
    }

    return createdProfiles;
  }

  async getProfiles(userId: string): Promise<UserProfile[]> {
    return this.prismaService.userProfile.findMany({
      where: { userId },
    });
  }
}
