import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { TrustService } from './trust.service';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VouchDto {
  @ApiProperty({ description: 'Optional message from the voucher', required: false })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiProperty({ description: 'The profile ID of the voucher', required: true })
  @IsString()
  @IsNotEmpty()
  voucherProfileId!: string;
}

@ApiTags('Trust')
@Controller('trust')
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get('score/me')
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user's trust score" })
  @ApiResponse({ status: 200, description: 'Trust score retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User profile not found' })
  async getMyScore(@CurrentUser() user: JwtPayload) {
    return this.trustService.getMyScore(user.sub);
  }

  @Get('score/:profileId')
  @ApiOperation({ summary: 'Get trust score and breakdown for a profile' })
  @ApiParam({ name: 'profileId', description: 'The user profile ID to lookup' })
  @ApiResponse({ status: 200, description: 'Trust score retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getScore(@Param('profileId') profileId: string) {
    return this.trustService.getScore(profileId);
  }

  @Post('vouch/:profileId')
  @UseGuards(JwtAuthGuard, TokenBlacklistGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vouch for a service provider profile' })
  @ApiParam({ name: 'profileId', description: 'The provider profile ID being vouched for' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        voucherProfileId: { type: 'string', description: 'The voucher own profile ID' },
        message: { type: 'string', description: 'Optional message' },
      },
      required: ['voucherProfileId'],
    },
  })
  @ApiResponse({ status: 200, description: 'Vouch registered and score updated successfully' })
  @ApiResponse({ status: 400, description: 'Self-vouching or duplicate vouching rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async vouch(
    @Param('profileId') profileId: string,
    @Body() body: VouchDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.trustService.vouch(
      user.sub,
      body.voucherProfileId,
      profileId,
      body.message,
    );
  }

  @Get('vouches/:profileId')
  @ApiOperation({ summary: 'Get list of vouches received by a profile' })
  @ApiParam({ name: 'profileId', description: 'The user profile ID' })
  @ApiResponse({ status: 200, description: 'Vouches list retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getVouches(@Param('profileId') profileId: string) {
    return this.trustService.getVouches(profileId);
  }
}
