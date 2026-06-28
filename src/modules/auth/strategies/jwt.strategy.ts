/**
 * jwt.strategy.ts
 *
 * Passport strategy for JWT authentication.
 *
 * This strategy is registered under the name 'jwt' and is invoked by
 * JwtAuthGuard on every protected route.
 *
 * Token extraction:
 *   The access token is stored in an httpOnly cookie named `access_token`.
 *   Using httpOnly cookies (instead of the Authorization header) protects
 *   against XSS attacks — JavaScript running in the browser cannot read
 *   httpOnly cookies.
 *
 * Validation pipeline:
 *   1. ExtractJwt reads the token from the `access_token` cookie
 *   2. passport-jwt verifies the signature with JWT_ACCESS_SECRET
 *   3. passport-jwt checks `exp` — throws 401 if expired
 *   4. Our validate() checks the Redis blacklist (revoked tokens)
 *   5. Our validate() checks that the user still exists in the DB
 *      (handles the edge case where the account was soft-deleted after
 *       the token was issued)
 *
 * If all checks pass, the returned payload is attached to `request.user`
 * and made available via the @CurrentUser() decorator.
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super({
      // Custom extractor: read token from the `access_token` httpOnly cookie
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request): string | null => req?.cookies?.['access_token'] ?? null,
      ]),

      // Let passport-jwt handle expiry checking (throws 401 if expired)
      ignoreExpiration: false,

      // Must match the secret used to sign the token in AuthService
      secretOrKey: configService.get<string>('jwt.accessSecret')!,

      // We need access to the raw request inside validate() for cookie extraction
      passReqToCallback: true,
    });
  }

  /**
   * Called by Passport after signature + expiry are verified.
   *
   * We perform two additional checks here:
   *  1. Redis blacklist — rejects rotated/revoked tokens
   *  2. DB user lookup  — rejects tokens for soft-deleted accounts
   *
   * @param req     The raw Express request (needed to read the cookie)
   * @param payload The decoded JWT payload (sub, email, iat, exp)
   * @returns       The payload, which Passport attaches to request.user
   */
  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    const token: string | undefined = req?.cookies?.['access_token'];

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    // Step 1: Reject tokens that were blacklisted during token rotation
    const blacklisted = await this.redisService.isBlacklisted(token);
    if (blacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Step 2: Confirm the user still exists and has not been soft-deleted
    // (A valid token could still exist for an account deleted by the cron job)
    const user = await this.prismaService.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('User not found or account deleted');
    }

    // Return the payload — Passport attaches it to request.user
    return payload;
  }
}
