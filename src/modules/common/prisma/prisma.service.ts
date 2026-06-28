import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * PrismaService
 *
 * Wraps the Prisma v7 ORM client and manages the database connection lifecycle.
 *
 * In Prisma v7, the database connection is managed via a driver adapter.
 * We instantiate a pg.Pool and wrap it in a PrismaPg adapter to pass to PrismaClient.
 *
 * Decorated with @Injectable() so NestJS DI can inject it everywhere.
 * The PrismaModule marks it @Global(), so this is only provided once.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    this.pool = pool;
  }

  /**
   * Called automatically by NestJS when the module is initialised.
   * Opens the underlying database connection pool.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Called automatically by NestJS on application shutdown.
   * Cleanly closes the connection pool to avoid resource leaks.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
