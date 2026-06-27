/**
 * jwt-auth.guard.ts
 *
 * Standard Passport JWT guard. It delegates to the 'jwt' Passport strategy
 * (defined in jwt.strategy.ts) which:
 *  1. Extracts the access token from the `access_token` httpOnly cookie
 *  2. Verifies the JWT signature using JWT_ACCESS_SECRET
 *  3. Checks the token expiry
 *  4. Checks the Redis blacklist
 *  5. Confirms the user still exists in the database (not soft-deleted)
 *
 * If any step fails, Passport throws a 401 UnauthorizedException.
 *
 * Usage: @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
 * (TokenBlacklistGuard is applied after this guard as a second layer)
 */
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Delegates to the Passport 'jwt' strategy via AuthGuard
    return super.canActivate(context);
  }
}
