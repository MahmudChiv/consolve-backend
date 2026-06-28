import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Response, Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { ThrottlerGuard } from '@nestjs/throttler';

const mockAuthService = {
  register: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
  refresh: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
};

const mockRes = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

const makeReq = (cookies: Record<string, string> = {}): Partial<Request> => ({
  cookies,
  user: { sub: 'user-uuid', phoneNumber: '+2348000000001' },
});

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(TokenBlacklistGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('should call authService.register and return result', async () => {
      const dto: RegisterDto = { phoneNumber: '+2348000000001', password: 'MyStr0ng!Pass' };
      mockAuthService.register.mockResolvedValue({ message: 'OTP sent to your phone number' });

      const result = await controller.register(dto, mockRes);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto, mockRes);
      expect(result.message).toBe('OTP sent to your phone number');
    });
  });

  describe('verifyOtp', () => {
    it('should call authService.verifyOtp with correct args', async () => {
      const dto: VerifyOtpDto = { otp: '123456' };
      const req = makeReq({ access_token: 'old.token' }) as Request;
      mockAuthService.verifyOtp.mockResolvedValue({ message: 'Phone number verified successfully' });

      const result = await controller.verifyOtp(
        dto,
        { sub: 'user-uuid', phoneNumber: '+234' },
        req,
        mockRes,
      );

      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(
        'user-uuid',
        dto,
        'old.token',
        mockRes,
      );
      expect(result.message).toBe('Phone number verified successfully');
    });
  });

  describe('resendOtp', () => {
    it('should call authService.resendOtp', async () => {
      mockAuthService.resendOtp.mockResolvedValue({ message: 'OTP resent to your phone number' });

      const result = await controller.resendOtp({ sub: 'user-uuid', phoneNumber: '+234' });

      expect(mockAuthService.resendOtp).toHaveBeenCalledWith('user-uuid');
      expect(result.message).toBe('OTP resent to your phone number');
    });
  });

  describe('refresh', () => {
    it('should throw ForbiddenException if no refresh_token cookie', async () => {
      const req = makeReq({}) as Request;
      await expect(controller.refresh(req, mockRes)).rejects.toThrow(ForbiddenException);
    });

    it('should call authService.refresh when refresh token present', async () => {
      const req = {
        cookies: { refresh_token: 'rt', access_token: 'at' },
        user: { sub: 'user-uuid', phoneNumber: '+234' },
      } as unknown as Request;
      mockAuthService.refresh.mockResolvedValue({ message: 'Tokens refreshed successfully' });

      const result = await controller.refresh(req, mockRes);

      expect(mockAuthService.refresh).toHaveBeenCalledWith(
        'user-uuid',
        'rt',
        'at',
        mockRes,
      );
      expect(result.message).toBe('Tokens refreshed successfully');
    });
  });

  describe('login', () => {
    it('should call authService.login', async () => {
      const dto = { phoneNumber: '+2348000000001', password: 'password' };
      mockAuthService.login.mockResolvedValue({ message: 'OTP sent' });

      const result = await controller.login(dto, mockRes);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto, mockRes);
      expect(result.message).toBe('OTP sent');
    });
  });

  describe('logout', () => {
    it('should call authService.logout', async () => {
      const req = { cookies: { access_token: 'at' } } as unknown as Request;
      mockAuthService.logout.mockResolvedValue({ message: 'Logged out' });

      const result = await controller.logout(
        { sub: 'user-uuid', phoneNumber: '+234' },
        req,
        mockRes,
      );

      expect(mockAuthService.logout).toHaveBeenCalledWith('user-uuid', 'at', mockRes);
      expect(result.message).toBe('Logged out');
    });
  });

  describe('forgotPassword', () => {
    it('should call authService.forgotPassword', async () => {
      const dto = { phoneNumber: '+2348000000001' };
      mockAuthService.forgotPassword.mockResolvedValue({ message: 'OTP sent' });

      const result = await controller.forgotPassword(dto, mockRes);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto, mockRes);
      expect(result.message).toBe('OTP sent');
    });
  });

  describe('resetPassword', () => {
    it('should call authService.resetPassword', async () => {
      const dto = { otp: '123456', newPassword: 'NewStr0ng!Pass' };
      const req = { cookies: { access_token: 'at' } } as unknown as Request;
      mockAuthService.resetPassword.mockResolvedValue({ message: 'Password reset' });

      const result = await controller.resetPassword(
        dto,
        { sub: 'user-uuid', phoneNumber: '+234' },
        req,
        mockRes,
      );

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
        'user-uuid',
        dto,
        'at',
        mockRes,
      );
      expect(result.message).toBe('Password reset');
    });
  });
});
