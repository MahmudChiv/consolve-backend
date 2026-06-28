"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var NotificationMockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationMockService = void 0;
const common_1 = require("@nestjs/common");
let NotificationMockService = NotificationMockService_1 = class NotificationMockService {
    logger = new common_1.Logger(NotificationMockService_1.name);
    async notify(userId, userProfileId, type, title, message, data) {
        this.logger.log(`[MOCK NOTIFICATION] userId=${userId} profileId=${userProfileId} type=${type} title="${title}" msg="${message}" data=${JSON.stringify(data ?? {})}`);
    }
};
exports.NotificationMockService = NotificationMockService;
exports.NotificationMockService = NotificationMockService = NotificationMockService_1 = __decorate([
    (0, common_1.Injectable)()
], NotificationMockService);
//# sourceMappingURL=notification.mock.service.js.map