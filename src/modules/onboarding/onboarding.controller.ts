/**
 * onboarding.controller.ts
 *
 * HTTP controller for the AI onboarding flow.
 *
 * Routes:
 *   GET  /user/onboarding/session    — returns current session state (for page reload reconnect)
 *   POST /user/onboarding            — streams an AI chat turn via SSE
 *   PATCH /user/onboarding           — finalises onboarding by adding location
 *
 * SSE Format (POST):
 *   Each Server-Sent Event carries a `type` and `data` field:
 *     event: chunk   — partial AI text token
 *     event: identity — live identity payload update (client updates side panel)
 *     event: done    — final identity payload (onboarding complete)
 *     event: error   — error message
 *
 *   The client should listen for `identity` events to update the side panel in real time,
 *   and `done` to display the completed summary card.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response, Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TokenBlacklistGuard } from '../common/guards/token-blacklist.guard';
import { ChatMessageDto } from './dto/chat-message.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('Onboarding')
@ApiCookieAuth('access_token')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@UseGuards(JwtAuthGuard, TokenBlacklistGuard)
@Controller('user/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // ─── GET /user/onboarding/session ──────────────────────────────────────────

  @Get('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current onboarding session state',
    description:
      'Returns the current Identity fields collected so far and the current step index. ' +
      'Use this on page-reload to restore the side panel and resume the conversation.',
  })
  @ApiResponse({ status: 200, description: 'Session state returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSession(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<object> {
    const userProfileId = (req.query['profileId'] as string) ?? '';
    return this.onboardingService.getSessionState(user.sub, userProfileId);
  }

  // ─── POST /user/onboarding ─────────────────────────────────────────────────

  @Post()
  @ApiOperation({
    summary: 'Send a message in the AI onboarding chat (SSE stream)',
    description: `
Streams the AI's response as Server-Sent Events (SSE).

**Connect via EventSource or fetch with ReadableStream.**

Event types emitted:
- \`chunk\`    — partial AI text token (render immediately)
- \`identity\` — JSON with current collected fields (update side panel)
- \`done\`     — final payload, onboarding conversation is complete
- \`error\`    — error description

Set \`mode: "voice"\` to signal a voice-mode session (connects to the WS gateway instead of this endpoint for audio, but this POST is used for the initial join and session validation).
    `.trim(),
  })
  @ApiResponse({ status: 200, description: 'SSE stream of AI response' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'CUSTOMER type — no onboarding required' })
  async chat(
    @Body() dto: ChatMessageDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const userProfileId = (req.query['profileId'] as string) ?? '';

    const writeEvent = (type: string, data: string) => {
      res.write(`event: ${type}\ndata: ${data}\n\n`);
    };

    try {
      const iter = this.onboardingService.processMessage(
        user.sub,
        userProfileId,
        dto.message,
        dto.mode ?? 'text',
      );

      for await (const event of iter) {
        writeEvent(event.type, event.data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      writeEvent('error', JSON.stringify({ message }));
    } finally {
      res.end();
    }
  }

  // ─── PATCH /user/onboarding ────────────────────────────────────────────────

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add location and complete onboarding',
    description:
      'Saves the user\'s location to their Identity record and marks onboarding as COMPLETED. ' +
      'Call this after the AI conversation is done. Requires the AI chat to have been completed first.',
  })
  @ApiResponse({ status: 200, description: 'Location saved, onboarding completed' })
  @ApiResponse({ status: 400, description: 'AI onboarding not yet completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async finaliseLocation(
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): Promise<{ message: string; data: object }> {
    const userProfileId = (req.query['profileId'] as string) ?? '';
    const updated = await this.onboardingService.finaliseLocation(
      user.sub,
      userProfileId,
      dto,
    );
    return { message: 'Location saved. Onboarding complete!', data: updated };
  }
}
