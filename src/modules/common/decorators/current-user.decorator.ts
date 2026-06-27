/**
 * current-user.decorator.ts
 *
 * A custom NestJS parameter decorator that extracts the authenticated
 * user's JWT payload from the request object.
 *
 * After JwtAuthGuard runs, Passport attaches the validated payload returned
 * by JwtStrategy.validate() to `request.user`. This decorator provides a
 * clean, typed way to access that data in controller method parameters.
 *
 * Usage in a controller:
 *   @Post('example')
 *   @UseGuards(JwtAuthGuard)
 *   example(@CurrentUser() user: JwtPayload) {
 *     console.log(user.sub); // the user's UUID
 *   }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape of the JWT access token payload.
 *
 * `sub`         — Subject: the user's UUID (standard JWT claim)
 * `phoneNumber` — Included for convenience so controllers don't need DB lookups
 * `iat`         — Issued-at timestamp (seconds since epoch, added by jwtService.sign)
 * `exp`         — Expiry timestamp (seconds since epoch, added by jwtService.sign)
 */
export interface JwtPayload {
  sub: string;
  phoneNumber: string;
  iat?: number;
  exp?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    // request.user is populated by Passport after JwtStrategy.validate() returns
    return request.user as JwtPayload;
  },
);
