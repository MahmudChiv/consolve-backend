import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UserService } from './user.service';

@ApiTags('User')
@ApiCookieAuth('access_token')
@Throttle({ default: { limit: 20, ttl: 60000 } })
@UseGuards(JwtAuthGuard, TokenBlacklistGuard)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create user profile(s)',
    description:
      'Creates one UserProfile record per selected type. A user can have multiple profiles (e.g. SERVICE_PROVIDER + CUSTOMER).',
  })
  @ApiResponse({
    status: 201,
    description: 'Profile(s) created successfully',
  })
  @ApiResponse({ status: 400, description: 'Account not verified' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async updateProfile(
    @Body() dto: CreateProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const profiles = await this.userService.createProfile(user.sub, dto);
    return { message: 'Profile(s) created successfully', data: profiles };
  }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all profiles for the authenticated user',
    description:
      'Returns all UserProfile records for the current user. ' +
      'Use the returned `id` field as `profileId` for onboarding and search endpoints.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user profiles',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfiles(@CurrentUser() user: JwtPayload) {
    const profiles = await this.userService.getProfiles(user.sub);
    return { message: 'Profiles retrieved', data: profiles };
  }
}
