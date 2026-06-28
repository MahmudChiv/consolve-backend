/**
 * redis.service.ts
 *
 * A thin, opinionated wrapper around ioredis that exposes only the
 * operations this application needs:
 *
 *  1. Generic key-value set/get/del (used for any cached data)
 *  2. Access token caching  — key pattern: `access:<userId>`
 *  3. Token blacklisting    — key pattern: `blacklist:<token>`
 *  4. Health ping           — used by HealthController
 *
 * All keys use auto-expiring TTLs (Redis EX option) so there is no
 * manual cleanup required.
 *
 * The service is marked @Global() via RedisModule so it can be injected
 * in any module without re-importing RedisModule.
 */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialises the Redis client when the NestJS module is loaded.
   * `lazyConnect: true` means no connection is established until the first
   * command — this allows the module to initialise even if Redis is temporarily
   * unavailable (useful for testing and delayed startup).
   */
  onModuleInit(): void {
    const redisUrl = this.configService.get<string>('redis.url');

    this.client = redisUrl
      ? new Redis(redisUrl, { lazyConnect: true })
      : new Redis({
          host: this.configService.get<string>('redis.host'),
          port: this.configService.get<number>('redis.port'),
          password: this.configService.get<string>('redis.password') || undefined,
          lazyConnect: true,
        });

    this.client.on('connect', () =>
      this.logger.log('Redis connection established'),
    );
    this.client.on('error', (err) =>
      this.logger.error('Redis error', err),
    );
  }

  /**
   * Gracefully closes the Redis connection when the application shuts down.
   * `quit()` sends a QUIT command and waits for the response before closing,
   * unlike `disconnect()` which closes the socket immediately.
   */
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }

  /** Expose the raw ioredis client (used in tests for spy assertions) */
  getClient(): Redis {
    return this.client;
  }

  // ── Generic Operations ──────────────────────────────────────────────────

  /**
   * Store a string value with an auto-expiring TTL.
   * @param key   Redis key
   * @param value String value to store
   * @param ttlSeconds Expiry time in seconds
   */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Retrieve a string value by key. Returns null if the key does not
   * exist or has already expired.
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Delete a key immediately. */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // ── Blacklist Operations ────────────────────────────────────────────────

  /**
   * Add a token to the blacklist.
   *
   * The TTL should match the token's remaining lifetime so that Redis
   * automatically purges expired blacklist entries — keeping memory usage
   * bounded without a manual cleanup job.
   *
   * Key pattern: `blacklist:<token>`
   *
   * @param token      The raw JWT string or opaque token to blacklist
   * @param ttlSeconds How long to keep the blacklist entry
   */
  async blacklist(token: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`blacklist:${token}`, '1', 'EX', ttlSeconds);
  }

  /**
   * Check whether a token has been blacklisted.
   * Returns true if the token was revoked (key exists), false otherwise.
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const result = await this.client.exists(`blacklist:${token}`);
    return result === 1;
  }

  // ── Access Token Cache ──────────────────────────────────────────────────

  /**
   * Cache an access token for a user.
   *
   * Storing the access token in Redis enables fast identity lookup without
   * hitting the database on every request. The TTL matches the JWT expiry
   * so the cache entry auto-expires when the token becomes invalid.
   *
   * Key pattern: `access:<userId>`
   */
  async cacheAccessToken(
    userId: string,
    token: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.set(`access:${userId}`, token, ttlSeconds);
  }

  /** Retrieve the cached access token for a user, or null if not found. */
  async getCachedAccessToken(userId: string): Promise<string | null> {
    return this.get(`access:${userId}`);
  }

  /**
   * Delete the cached access token for a user.
   * Called when tokens are rotated to prevent stale token reuse.
   */
  async deleteCachedAccessToken(userId: string): Promise<void> {
    await this.del(`access:${userId}`);
  }

  // ── Health ──────────────────────────────────────────────────────────────

  /**
   * Ping Redis to confirm the connection is alive.
   * Used by the HealthController to report infrastructure status.
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }
}
