/**
 * prisma.service.spec.ts
 *
 * Unit tests for PrismaService lifecycle methods (Prisma v5).
 *
 * We mock @prisma/client at the module level so no real DB connection
 * is opened. PrismaService is then instantiated directly (bypassing
 * NestJS DI) to verify $connect and $disconnect are called correctly.
 */

// ── Mock @prisma/client — no real DB calls ────────────────────────────────────
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(function () {
      this.$connect = jest.fn().mockResolvedValue(undefined);
      this.$disconnect = jest.fn().mockResolvedValue(undefined);
    }),
  };
});

// Import AFTER the mocks are registered
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrismaService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call $connect on module init', async () => {
    await service.onModuleInit();
    expect((service as any).$connect).toHaveBeenCalledTimes(1);
  });

  it('should call $disconnect on module destroy', async () => {
    await service.onModuleDestroy();
    expect((service as any).$disconnect).toHaveBeenCalledTimes(1);
  });
});
