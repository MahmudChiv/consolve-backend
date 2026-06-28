/**
 * prisma.service.spec.ts
 *
 * Unit tests for PrismaService lifecycle methods (Prisma v7).
 *
 * We mock @prisma/client, pg, and @prisma/adapter-pg at the module level
 * so no real DB connection or pool is opened. PrismaService is then
 * instantiated directly to verify lifecycle events are handled correctly.
 */

const mockPoolEnd = jest.fn().mockResolvedValue(undefined);

// Mock pg module
jest.mock('pg', () => {
  return {
    Pool: jest.fn().mockImplementation(function () {
      this.end = mockPoolEnd;
    }),
  };
});

// Mock @prisma/adapter-pg module
jest.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: jest.fn(),
  };
});

// Mock @prisma/client — no real DB calls
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

  it('should call $disconnect and close pool on module destroy', async () => {
    await service.onModuleDestroy();
    expect((service as any).$disconnect).toHaveBeenCalledTimes(1);
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
