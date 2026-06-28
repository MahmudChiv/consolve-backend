/**
 * booking.controller.ts
 *
 * HTTP layer for the Booking module.
 *
 * Routes:
 *   POST   /api/v1/bookings              — Create a new booking
 *   GET    /api/v1/bookings/my-hires      — Customer's bookings (paginated, cached)
 *   GET    /api/v1/bookings/my-jobs       — Provider's jobs (paginated, cached)
 *   GET    /api/v1/bookings/:id           — Booking detail (cached)
 *   PATCH  /api/v1/bookings/:id/accept    — Provider accepts booking
 *   PATCH  /api/v1/bookings/:id/complete  — Either party completes booking
 *   PATCH  /api/v1/bookings/:id/cancel    — Either party cancels booking
 *   PATCH  /api/v1/bookings/:id/dispute   — Either party disputes booking
 *   POST   /api/v1/bookings/:id/review    — Customer submits review
 *
 * All routes: JwtAuthGuard + TokenBlacklistGuard
 * Rate limits per endpoint as specified in architecture doc
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BookingStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { DisputeBookingDto } from './dto/dispute-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';

@ApiTags('Bookings')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, TokenBlacklistGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ─── POST /bookings ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Create a new booking',
    description: `
Creates a booking request from the authenticated customer to a provider.
The customerProfileId is extracted from the JWT — it cannot be supplied in the body.

**Rules:**
- Cannot book yourself
- Provider must have completed onboarding
- If bookingType is SCHEDULED, scheduledAt must be provided and in the future
    `.trim(),
  })
  @ApiBody({ type: CreateBookingDto })
  @ApiResponse({
    status: 201,
    description: 'Booking created successfully',
    schema: {
      example: {
        success: true,
        message: 'Booking request sent successfully',
        data: {
          id: 'uuid',
          providerProfileId: 'uuid',
          customerProfileId: 'uuid',
          serviceType: 'Tailoring',
          status: 'PENDING',
          bookingType: 'HIRE_NOW',
          priceAgreed: 25000,
          currency: 'NGN',
          createdAt: '2026-06-28T...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or business rule violation' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Provider profile not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async createBooking(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBookingDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.createBooking(user.sub, dto);
    return {
      success: true,
      message: 'Booking request sent successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /bookings/my-hires ─────────────────────────────────────────────────

  @Get('my-hires')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get bookings as a customer (my hires)',
    description:
      'Returns paginated bookings where the authenticated user is the customer. ' +
      'Optionally filter by status. Results are cached in Redis for 2 minutes.',
  })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Customer bookings retrieved',
    schema: {
      example: {
        success: true,
        message: 'Bookings retrieved',
        data: {
          bookings: [],
          pagination: { page: 1, limit: 10, total: 24, totalPages: 3 },
          cached: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async getMyHires(
    @CurrentUser() user: JwtPayload,
    @Query() query: BookingQueryDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.getMyHires(user.sub, query);
    return {
      success: true,
      message: 'Bookings retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /bookings/my-jobs ──────────────────────────────────────────────────

  @Get('my-jobs')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get bookings as a provider (my jobs)',
    description:
      'Returns paginated bookings where the authenticated user is the provider. ' +
      'Optionally filter by status. Results are cached in Redis for 2 minutes.',
  })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Provider bookings retrieved',
    schema: {
      example: {
        success: true,
        message: 'Bookings retrieved',
        data: {
          bookings: [],
          pagination: { page: 1, limit: 10, total: 5, totalPages: 1 },
          cached: false,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async getMyJobs(
    @CurrentUser() user: JwtPayload,
    @Query() query: BookingQueryDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.getMyJobs(user.sub, query);
    return {
      success: true,
      message: 'Bookings retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── GET /bookings/:id ──────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get booking details by ID',
    description:
      'Returns full booking detail. Only accessible by the customer or provider on the booking. ' +
      'Cached in Redis for 5 minutes.',
  })
  @ApiParam({
    name: 'id',
    description: 'Booking UUID',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @ApiResponse({ status: 200, description: 'Booking detail retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant on this booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.getBookingById(id, user.sub);
    return {
      success: true,
      message: 'Booking retrieved',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── PATCH /bookings/:id/accept ─────────────────────────────────────────────

  @Patch(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Accept a booking (provider only)',
    description:
      'Provider accepts a PENDING booking. Status transitions to ACCEPTED. ' +
      'Customer is notified.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking accepted',
    schema: {
      example: {
        success: true,
        message: 'Booking accepted',
        data: { id: 'uuid', status: 'ACCEPTED', updatedAt: '2026-06-28T...' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only provider can accept' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async acceptBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.acceptBooking(id, user.sub);
    return {
      success: true,
      message: 'Booking accepted',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── PATCH /bookings/:id/complete ───────────────────────────────────────────

  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Complete a booking (either party)',
    description:
      'Marks an ACCEPTED or IN_PROGRESS booking as COMPLETED. ' +
      'Triggers trust score recalculation and notifies the customer.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({
    status: 200,
    description: 'Booking completed',
    schema: {
      example: {
        success: true,
        message: 'Booking completed',
        data: {
          id: 'uuid',
          status: 'COMPLETED',
          completedAt: '2026-06-28T...',
          updatedAt: '2026-06-28T...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async completeBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.completeBooking(id, user.sub);
    return {
      success: true,
      message: 'Booking completed',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── PATCH /bookings/:id/cancel ─────────────────────────────────────────────

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Cancel a booking (either party)',
    description:
      'Cancels a PENDING or ACCEPTED booking. Both parties are notified. ' +
      'A reason must be provided.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: CancelBookingDto })
  @ApiResponse({
    status: 200,
    description: 'Booking cancelled',
    schema: {
      example: {
        success: true,
        message: 'Booking cancelled',
        data: {
          id: 'uuid',
          status: 'CANCELLED',
          cancelledAt: '2026-06-28T...',
          updatedAt: '2026-06-28T...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async cancelBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.cancelBooking(id, user.sub, dto);
    return {
      success: true,
      message: 'Booking cancelled',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── PATCH /bookings/:id/dispute ────────────────────────────────────────────

  @Patch(':id/dispute')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Dispute a booking (either party)',
    description:
      'Raises a dispute on an ACCEPTED, IN_PROGRESS, or COMPLETED booking. ' +
      'Both parties are notified and a trust penalty is applied. ' +
      'Resolution is manual for hackathon scope.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: DisputeBookingDto })
  @ApiResponse({
    status: 200,
    description: 'Dispute raised',
    schema: {
      example: {
        success: true,
        message: 'Dispute raised successfully',
        data: {
          id: 'uuid',
          status: 'DISPUTED',
          disputeReason: 'Provider did not show up',
          updatedAt: '2026-06-28T...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async disputeBooking(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisputeBookingDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.disputeBooking(id, user.sub, dto);
    return {
      success: true,
      message: 'Dispute raised successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }

  // ─── POST /bookings/:id/review ──────────────────────────────────────────────

  @Post(':id/review')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Submit a review (customer only)',
    description:
      'Submits a star rating (1-5) and optional comment for a COMPLETED booking. ' +
      'Only the customer can review. One review per booking. ' +
      'Triggers trust score recalculation and notifies the provider.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiBody({ type: ReviewBookingDto })
  @ApiResponse({
    status: 201,
    description: 'Review submitted',
    schema: {
      example: {
        success: true,
        message: 'Review submitted successfully',
        data: {
          id: 'uuid',
          bookingId: 'uuid',
          rating: 5,
          comment: 'Excellent work, very professional',
          createdAt: '2026-06-28T...',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Booking not in COMPLETED status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only customer can review' })
  @ApiResponse({ status: 409, description: 'Review already submitted' })
  async submitReview(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewBookingDto,
  ): Promise<Record<string, unknown>> {
    const data = await this.bookingService.submitReview(id, user.sub, dto);
    return {
      success: true,
      message: 'Review submitted successfully',
      data,
      timestamp: new Date().toISOString(),
    };
  }
}
