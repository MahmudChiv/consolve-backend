import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
  }));
});

const mockConfig = {
  get: jest.fn((key: string) => {
    const map: Record<string, unknown> = {
      'redis.host': 'localhost',
      'redis.port': 6379,
      'redis.password': '',
    };
    return map[key];
  }),
};

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should set a key with TTL', async () => {
    await service.set('key', 'value', 60);
    expect(service.getClient().set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
  });

  it('should get a key', async () => {
    (service.getClient().get as jest.Mock).mockResolvedValue('value');
    const result = await service.get('key');
    expect(result).toBe('value');
  });

  it('should delete a key', async () => {
    await service.del('key');
    expect(service.getClient().del).toHaveBeenCalledWith('key');
  });

  it('should blacklist a token', async () => {
    await service.blacklist('mytoken', 900);
    expect(service.getClient().set).toHaveBeenCalledWith('blacklist:mytoken', '1', 'EX', 900);
  });

  it('should return false for non-blacklisted token', async () => {
    (service.getClient().exists as jest.Mock).mockResolvedValue(0);
    const result = await service.isBlacklisted('mytoken');
    expect(result).toBe(false);
  });

  it('should return true for blacklisted token', async () => {
    (service.getClient().exists as jest.Mock).mockResolvedValue(1);
    const result = await service.isBlacklisted('mytoken');
    expect(result).toBe(true);
  });

  it('should cache access token', async () => {
    await service.cacheAccessToken('user-uuid', 'jwt.token', 900);
    expect(service.getClient().set).toHaveBeenCalledWith('access:user-uuid', 'jwt.token', 'EX', 900);
  });

  it('should get cached access token', async () => {
    (service.getClient().get as jest.Mock).mockResolvedValue('jwt.token');
    const result = await service.getCachedAccessToken('user-uuid');
    expect(result).toBe('jwt.token');
  });

  it('should delete cached access token', async () => {
    await service.deleteCachedAccessToken('user-uuid');
    expect(service.getClient().del).toHaveBeenCalledWith('access:user-uuid');
  });

  it('should ping redis', async () => {
    const result = await service.ping();
    expect(result).toBe('PONG');
  });
});
