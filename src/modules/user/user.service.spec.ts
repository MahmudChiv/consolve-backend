import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Gender, UserType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UserService } from './user.service';

const mockPrisma = {
  user: {
    findFirst: jest.fn(),
  },
  userProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const makeUser = (overrides = {}) => ({
  id: 'user-uuid',
  phoneNumber: '+2348000000001',
  hashedPassword: 'hashed_pw',
  isVerified: true,
  refreshToken: null,
  hashedOtp: null,
  otpExpiry: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeProfile = (type: UserType) => ({
  id: 'profile-uuid',
  userId: 'user-uuid',
  firstName: 'John',
  lastName: 'Doe',
  gender: Gender.MALE,
  type,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('createProfile', () => {
    const dto: CreateProfileDto = {
      firstName: 'John',
      lastName: 'Doe',
      gender: Gender.MALE,
      types: [UserType.CUSTOMER, UserType.SERVICE_PROVIDER],
    };

    it('should create a profile for each type', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create
        .mockResolvedValueOnce(makeProfile(UserType.CUSTOMER))
        .mockResolvedValueOnce(makeProfile(UserType.SERVICE_PROVIDER));

      const result = await service.createProfile('user-uuid', dto);

      expect(mockPrisma.userProfile.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('should skip already existing profile types', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.userProfile.findUnique
        .mockResolvedValueOnce(makeProfile(UserType.CUSTOMER)) // exists
        .mockResolvedValueOnce(null); // new
      mockPrisma.userProfile.create.mockResolvedValue(makeProfile(UserType.SERVICE_PROVIDER));

      const result = await service.createProfile('user-uuid', dto);

      expect(mockPrisma.userProfile.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.createProfile('missing', dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user not verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser({ isVerified: false }));
      await expect(service.createProfile('user-uuid', dto)).rejects.toThrow(BadRequestException);
    });

    it('should handle single type correctly', async () => {
      const singleTypeDto = { ...dto, types: [UserType.TRADER] };
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue(makeProfile(UserType.TRADER));

      const result = await service.createProfile('user-uuid', singleTypeDto);
      expect(result).toHaveLength(1);
    });
  });

  describe('getProfiles', () => {
    it('should return all profiles for a user', async () => {
      const profiles = [
        makeProfile(UserType.CUSTOMER),
        makeProfile(UserType.TRADER),
      ];
      mockPrisma.userProfile.findMany.mockResolvedValue(profiles);

      const result = await service.getProfiles('user-uuid');
      expect(result).toEqual(profiles);
      expect(mockPrisma.userProfile.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid' },
      });
    });
  });
});
