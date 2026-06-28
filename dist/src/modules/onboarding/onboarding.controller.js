"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnboardingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const token_blacklist_guard_1 = require("../common/guards/token-blacklist.guard");
const chat_message_dto_1 = require("./dto/chat-message.dto");
const update_location_dto_1 = require("./dto/update-location.dto");
const onboarding_service_1 = require("./onboarding.service");
let OnboardingController = class OnboardingController {
    onboardingService;
    constructor(onboardingService) {
        this.onboardingService = onboardingService;
    }
    async getSession(user, req) {
        const userProfileId = req.query['profileId'] ?? '';
        return this.onboardingService.getSessionState(user.sub, userProfileId);
    }
    async chat(dto, user, req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const userProfileId = req.query['profileId'] ?? '';
        const writeEvent = (type, data) => {
            res.write(`event: ${type}\ndata: ${data}\n\n`);
        };
        try {
            const iter = this.onboardingService.processMessage(user.sub, userProfileId, dto.message, dto.mode ?? 'text');
            for await (const event of iter) {
                writeEvent(event.type, event.data);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Internal server error';
            writeEvent('error', JSON.stringify({ message }));
        }
        finally {
            res.end();
        }
    }
    async finaliseLocation(dto, user, req) {
        const userProfileId = req.query['profileId'] ?? '';
        const updated = await this.onboardingService.finaliseLocation(user.sub, userProfileId, dto);
        return { message: 'Location saved. Onboarding complete!', data: updated };
    }
};
exports.OnboardingController = OnboardingController;
__decorate([
    (0, common_1.Get)('session'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Get current onboarding session state',
        description: 'Returns the current Identity fields collected so far and the current step index. ' +
            'Use this on page-reload to restore the side panel and resume the conversation.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Session state returned' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "getSession", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
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
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'SSE stream of AI response' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Validation error' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'CUSTOMER type — no onboarding required' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [chat_message_dto_1.ChatMessageDto, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "chat", null);
__decorate([
    (0, common_1.Patch)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Add location and complete onboarding',
        description: 'Saves the user\'s location to their Identity record and marks onboarding as COMPLETED. ' +
            'Call this after the AI conversation is done. Requires the AI chat to have been completed first.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Location saved, onboarding completed' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'AI onboarding not yet completed' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_location_dto_1.UpdateLocationDto, Object, Object]),
    __metadata("design:returntype", Promise)
], OnboardingController.prototype, "finaliseLocation", null);
exports.OnboardingController = OnboardingController = __decorate([
    (0, swagger_1.ApiTags)('Onboarding'),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 60000 } }),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, common_1.Controller)('user/onboarding'),
    __metadata("design:paramtypes", [onboarding_service_1.OnboardingService])
], OnboardingController);
//# sourceMappingURL=onboarding.controller.js.map