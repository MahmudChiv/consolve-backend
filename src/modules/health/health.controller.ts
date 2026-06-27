/**
 * health.controller.ts
 *
 * Infrastructure health check endpoint.
 *
 * GET /health returns a JSON summary of the application's infrastructure state.
 * This endpoint is called by:
 *  - Load balancers (to decide whether to route traffic to this instance)
 *  - Monitoring tools (Datadog, Prometheus, etc.)
 *  - Deployment pipelines (readiness/liveness probes in Kubernetes)
 *
 * We check two things:
 *  1. Database — a raw SQL `SELECT 1` against PostgreSQL via Prisma
 *  2. Redis    — a PING command via ioredis
 *
 * @nestjs/terminus provides the HealthCheckService and result types.
 * We write a small inline custom indicator for Redis since terminus does
 * not ship one out of the box for bare ioredis connections.
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicator,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

/**
 * Inline Redis health indicator.
 *
 * Extends HealthIndicator (from @nestjs/terminus) which provides the
 * `getStatus()` helper that formats results in the shape terminus expects.
 */
class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  /**
   * Check Redis health by sending a PING command.
   * @param key  The key name to use in the health report (e.g. 'redis')
   * @returns    A HealthIndicatorResult: { redis: { status: 'up' | 'down' } }
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redisService.ping();
      // Redis responds with 'PONG' when healthy
      return this.getStatus(key, result === 'PONG');
    } catch {
      // Any exception means Redis is unreachable
      return this.getStatus(key, false);
    }
  }
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  /** Inline Redis indicator — instantiated in the constructor */
  private readonly redisIndicator: RedisHealthIndicator;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {
    // Instantiate the Redis indicator here since it is not an injectable provider
    this.redisIndicator = new RedisHealthIndicator(redisService);
  }

  /**
   * GET /health
   *
   * Returns HTTP 200 if all checks pass, HTTP 503 if any check fails.
   * Response shape (on success):
   * {
   *   "status": "ok",
   *   "info": {
   *     "database": { "status": "up" },
   *     "redis":    { "status": "up" }
   *   }
   * }
   */
  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Health check',
    description: 'Checks PostgreSQL database and Redis connectivity',
  })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Check 1: PostgreSQL — send a minimal query via Prisma
      async () => {
        await this.prismaService.$queryRaw`SELECT 1`;
        const result: HealthIndicatorResult = { database: { status: 'up' } };
        return result;
      },

      // Check 2: Redis — send a PING command
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
