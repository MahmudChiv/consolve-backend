/**
 * trust.service.ts
 *
 * Manages trust score calculation, caching, and vouching for providers.
 *
 * Score formula (weights total 100%):
 *  - completionRate      × 0.30  (job completion history)
 *  - communityScore      × 0.25  (avg rating + vouches)
 *  - paymentReliability  × 0.20  (default 70 — future: integrate payment data)
 *  - responseTimeScore   × 0.15  (default 70 — future: integrate response data)
 *  - profileCompleteness × 0.10  (identity fields filled)
 *  - disputePenalty      -15 per dispute (subtracted from final score)
 *
 * Caching: trust:score:<profileId> → 5-min TTL in Redis
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

const SCORE_CACHE_TTL = 300; // 5 minutes
const SCORE_CACHE_PREFIX = 'trust:score:';

@Injectable()
export class TrustService {
  private readonly logger = new Logger(TrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── Score Calculation ────────────────────────────────────────────────────────

  /**
   * Calculate a fresh trust score from DB data.
   * All queries run in parallel via Promise.all for performance.
   */
  private async calculateScore(providerProfileId: string) {
    const [bookings, reviews, vouches, identity, disputes] = await Promise.all([
      this.prisma.booking.findMany({ where: { providerProfileId } }),
      this.prisma.review.findMany({ where: { providerProfileId } }),
      this.prisma.vouch.findMany({ where: { providerProfileId } }),
      this.prisma.identity.findUnique({
        where: { userProfileId: providerProfileId },
      }),
      this.prisma.booking.findMany({
        where: { providerProfileId, status: 'DISPUTED' },
      }),
    ]);

    const totalJobs = bookings.length;
    const completedJobs = bookings.filter((b) => b.status === 'COMPLETED').length;
    const completionRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;
    const communityScore = Math.min(
      (avgRating / 5) * 70 + vouches.length * 10,
      100,
    );

    const profileCompleteness = identity
      ? (identity.profession ? 20 : 0) +
        (identity.expertise?.length > 0 ? 20 : 0) +
        (identity.pricing ? 20 : 0) +
        (identity.city ? 20 : 0) +
        (identity.summary ? 20 : 0)
      : 0;

    const overallScore =
      completionRate * 0.3 +
      communityScore * 0.25 +
      70 * 0.2 + // paymentReliability default
      70 * 0.15 + // responseTimeScore default
      profileCompleteness * 0.1;

    const disputePenalty = disputes.length * 15;
    const finalScore = Math.max(0, Math.min(100, overallScore - disputePenalty));

    return {
      overallScore: Math.round(finalScore),
      completionRate: Math.round(completionRate),
      communityScore: Math.round(communityScore),
      profileCompleteness: Math.round(profileCompleteness),
      disputePenalty,
      totalJobs,
      completedJobs,
      totalReviews: reviews.length,
      totalVouches: vouches.length,
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Recalculate and persist the trust score for a provider.
   * Called by BookingService on status changes (COMPLETED, DISPUTED, etc.)
   */
  async recalculate(providerProfileId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: providerProfileId },
    });
    if (!profile) return;

    const scores = await this.calculateScore(providerProfileId);

    await this.prisma.trustScore.upsert({
      where: { userProfileId: providerProfileId },
      update: {
        ...scores,
        lastCalculated: new Date(),
      },
      create: {
        userId: profile.userId,
        userProfileId: providerProfileId,
        ...scores,
        lastCalculated: new Date(),
      },
    });

    // Invalidate cache so next read gets fresh score
    await this.redis.del(`${SCORE_CACHE_PREFIX}${providerProfileId}`);
    this.logger.log(
      `Trust score recalculated for profile ${providerProfileId}: ${scores.overallScore}`,
    );
  }

  /**
   * GET /trust/score/:profileId
   * Returns the trust score + breakdown, cached for 5 minutes.
   */
  async getScore(profileId: string) {
    const cacheKey = `${SCORE_CACHE_PREFIX}${profileId}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check profile exists
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Get stored score or calculate fresh
    let trustScore = await this.prisma.trustScore.findUnique({
      where: { userProfileId: profileId },
    });

    if (!trustScore) {
      // First-time: calculate and persist
      await this.recalculate(profileId);
      trustScore = await this.prisma.trustScore.findUnique({
        where: { userProfileId: profileId },
      });
    }

    const result = {
      profileId,
      overallScore: trustScore?.overallScore ?? 0,
      breakdown: {
        completionRate: trustScore?.completionRate ?? 0,
        communityScore: trustScore?.communityScore ?? 0,
        profileCompleteness: trustScore?.profileCompleteness ?? 0,
        paymentReliability: trustScore?.paymentReliability ?? 70,
        responseTimeScore: trustScore?.responseTimeScore ?? 70,
        disputePenalty: trustScore?.disputePenalty ?? 0,
      },
      stats: {
        totalJobs: trustScore?.totalJobs ?? 0,
        completedJobs: trustScore?.completedJobs ?? 0,
        totalReviews: trustScore?.totalReviews ?? 0,
        totalVouches: trustScore?.totalVouches ?? 0,
      },
      lastCalculated: trustScore?.lastCalculated ?? new Date(),
    };

    // Cache for 5 minutes
    await this.redis.set(cacheKey, JSON.stringify(result), SCORE_CACHE_TTL);

    return result;
  }

  /**
   * GET /trust/score/me
   * Returns the authenticated user's own trust score.
   */
  async getMyScore(userId: string) {
    const profile = await this.prisma.userProfile.findFirst({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('No profile found. Create a profile first.');
    }
    return this.getScore(profile.id);
  }

  /**
   * POST /trust/vouch/:profileId
   * Vouch for a provider. Self-vouching is blocked.
   * Creates a Vouch record and triggers trust score recalculation.
   */
  async vouch(
    voucherUserId: string,
    voucherProfileId: string,
    targetProfileId: string,
    message?: string,
  ) {
    // Guard: cannot vouch for yourself
    if (voucherProfileId === targetProfileId) {
      throw new BadRequestException('You cannot vouch for yourself');
    }

    const targetProfile = await this.prisma.userProfile.findUnique({
      where: { id: targetProfileId },
    });
    if (!targetProfile) {
      throw new NotFoundException('Provider profile not found');
    }

    // Upsert: one vouch per voucher→provider pair (@@unique constraint)
    try {
      await this.prisma.vouch.create({
        data: {
          voucherId: voucherUserId,
          voucherProfileId,
          providerId: targetProfile.userId,
          providerProfileId: targetProfileId,
          message: message ?? null,
        },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation = already vouched
      if (err?.code === 'P2002') {
        throw new BadRequestException('You have already vouched for this provider');
      }
      throw err;
    }

    // Recalculate score now that a new vouch exists
    await this.recalculate(targetProfileId);

    return { message: 'Vouch submitted successfully' };
  }

  /**
   * GET /trust/vouches/:profileId
   * Returns all vouches received by a provider profile.
   */
  async getVouches(profileId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const vouches = await this.prisma.vouch.findMany({
      where: { providerProfileId: profileId },
      include: {
        voucherProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return vouches;
  }
}
