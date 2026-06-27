import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 *
 * Wraps the Prisma v5 ORM client and manages the database connection lifecycle.
 *
 * In Prisma v5, the PrismaClient constructor reads DATABASE_URL automatically
 * from the environment (via the `datasource.url = env("DATABASE_URL")` in
 * schema.prisma). No driver adapter or manual connection string wiring needed.
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

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
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
    this.logger.log('Database connection closed');
  }
}
