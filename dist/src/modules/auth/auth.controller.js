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
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const token_blacklist_guard_1 = require("../common/guards/token-blacklist.guard");
const auth_service_1 = require("./auth.service");
const register_dto_1 = require("./dto/register.dto");
const verify_otp_dto_1 = require("./dto/verify-otp.dto");
const login_dto_1 = require("./dto/login.dto");
const forgot_password_dto_1 = require("./dto/forgot-password.dto");
const reset_password_dto_1 = require("./dto/reset-password.dto");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async register(dto, res) {
        return this.authService.register(dto, res);
    }
    async verifyOtp(dto, user, req, res) {
        const oldToken = req.cookies?.['access_token'];
        return this.authService.verifyOtp(user.sub, dto, oldToken, res);
    }
    async resendOtp(user) {
        return this.authService.resendOtp(user.sub);
    }
    async refresh(req, res) {
        const refreshToken = req.cookies?.['refresh_token'];
        const oldAccessToken = req.cookies?.['access_token'];
        if (!refreshToken) {
            throw new common_1.ForbiddenException('No refresh token provided');
        }
        let userId;
        try {
            const payload = req['user'];
            if (payload?.sub) {
                userId = payload.sub;
            }
            else {
                const { JwtService } = await import('@nestjs/jwt');
                const jwtService = new JwtService({});
                const decoded = jwtService.decode(oldAccessToken ?? '');
                userId = decoded?.sub;
            }
        }
        catch {
            throw new common_1.ForbiddenException('Cannot identify user from token');
        }
        if (!userId)
            throw new common_1.ForbiddenException('Cannot identify user');
        return this.authService.refresh(userId, refreshToken, oldAccessToken, res);
    }
    async login(dto, res) {
        return this.authService.login(dto, res);
    }
    async logout(user, req, res) {
        const accessToken = req.cookies?.['access_token'];
        return this.authService.logout(user.sub, accessToken, res);
    }
    async forgotPassword(dto, res) {
        return this.authService.forgotPassword(dto, res);
    }
    async resetPassword(dto, user, req, res) {
        const oldToken = req.cookies?.['access_token'];
        return this.authService.resetPassword(user.sub, dto, oldToken, res);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Register with phone number and password',
        description: 'Creates a new user account, sends a 6-digit OTP via SMS, and issues an access token cookie.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OTP sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Phone number already registered' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Too many requests' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('verifyOtp'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify OTP and complete authentication',
        description: 'Verifies the 6-digit OTP, marks the account as verified, and rotates access + refresh tokens.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Account verified, tokens issued' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid or expired OTP' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_otp_dto_1.VerifyOtpDto, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.Post)('resendOtp'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Resend OTP',
        description: "Generates a new OTP and sends it to the user's phone number.",
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OTP resent' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Account already verified' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resendOtp", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiCookieAuth)('refresh_token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Refresh access and refresh tokens',
        description: 'Validates the refresh token from cookie and rotates both access and refresh tokens.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Tokens refreshed' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Invalid refresh token' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Login with phone number and password',
        description: 'Validates credentials, sends a 6-digit OTP via SMS, and issues a temporary access token cookie.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'OTP sent successfully' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Invalid phone number or password' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Logout user and revoke tokens',
        description: 'Blacklists the current access token, clears the refresh token, and deletes auth cookies.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Logged out successfully' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('forgotPassword'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Initiate password reset',
        description: 'Sends a 6-digit OTP to the phone number and sets a temporary access token cookie on success.',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'If an account exists, OTP has been sent.',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [forgot_password_dto_1.ForgotPasswordDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Patch)('resetPassword'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, token_blacklist_guard_1.TokenBlacklistGuard),
    (0, swagger_1.ApiCookieAuth)('access_token'),
    (0, swagger_1.ApiOperation)({
        summary: 'Verify OTP and reset password',
        description: 'Verifies OTP, updates password, blacklists the temporary access token, and clears auth cookies.',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Password reset successfully' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Invalid or expired OTP' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reset_password_dto_1.ResetPasswordDto, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map