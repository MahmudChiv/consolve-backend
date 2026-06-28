import { Test, TestingModule } from '@nestjs/testing';
import { Gender, UserType } from '@prisma/client';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CreateProfileDto } from './dto/create-profile.dto';

const mockUserService = {
  createProfile: jest.fn(),
};

describe('UserController', () => {
  let controller: UserController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(TokenBlacklistGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<UserController>(UserController);
  });

  describe('updateProfile', () => {
    it('should create profiles and return success response', async () => {
      const dto: CreateProfileDto = {
        firstName: 'John',
        lastName: 'Doe',
        gender: Gender.MALE,
        types: [UserType.CUSTOMER],
      };
      const mockProfiles = [
        {
          id: 'profile-uuid',
          userId: 'user-uuid',
          firstName: 'John',
          lastName: 'Doe',
          gender: Gender.MALE,
          type: UserType.CUSTOMER,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockUserService.createProfile.mockResolvedValue(mockProfiles);

      const result = await controller.updateProfile(dto, {
        sub: 'user-uuid',
        email: 'test@consolve.dev',
      });

      expect(mockUserService.createProfile).toHaveBeenCalledWith('user-uuid', dto);
      expect(result.message).toBe('Profile(s) created successfully');
      expect(result.data).toEqual(mockProfiles);
    });

    it('should propagate errors from userService', async () => {
      const dto: CreateProfileDto = {
        firstName: 'John',
        lastName: 'Doe',
        gender: Gender.MALE,
        types: [UserType.TRADER],
      };
      mockUserService.createProfile.mockRejectedValue(new Error('Not verified'));

      await expect(
        controller.updateProfile(dto, { sub: 'user-uuid', email: 'test@consolve.dev' }),
      ).rejects.toThrow('Not verified');
    });
  });
});
