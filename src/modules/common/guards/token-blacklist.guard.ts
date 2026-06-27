/**
 * token-blacklist.guard.ts
 *
 * A NestJS CanActivate guard that checks every incoming access token
 * against the Redis blacklist before allowing the request to proceed.
 *
 * Why is this needed alongside JwtAuthGuard?
 * ─────────────────────────────────────────
 * JWTs are stateless — once signed, they are valid until expiry regardless
 * of what the server does. Without a blacklist, a user whose token was just
 * rotated (after verifyOtp or refresh) could still reuse the OLD token for
 * up to 15 minutes.
 *
 * The Redis blacklist solves this: whenever tokens are rotated, the old
 * access token is written to Redis with its remaining TTL. This guard
 * rejects those revoked tokens immediately.
 *
 * Guard order in the controller:
 *   @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
 *
 * JwtAuthGuard runs first (validates signature + expiry), then this guard
 * checks the blacklist. Both must pass for the request to continue.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class TokenBlacklistGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract the raw token string from the httpOnly cookie
    const token: string | undefined = request.cookies?.['access_token'];

    if (!token) {
      throw new UnauthorizedException('No access token provided');
    }

    // O(1) Redis lookup — returns true if the token was previously revoked
    const blacklisted = await this.redisService.isBlacklisted(token);

    if (blacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return true;
  }
}
