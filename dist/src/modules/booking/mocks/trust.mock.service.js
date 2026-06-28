"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TrustMockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrustMockService = void 0;
const common_1 = require("@nestjs/common");
let TrustMockService = TrustMockService_1 = class TrustMockService {
    logger = new common_1.Logger(TrustMockService_1.name);
    async recalculate(providerProfileId) {
        this.logger.log(`[MOCK TRUST] recalculate providerProfileId=${providerProfileId}`);
    }
};
exports.TrustMockService = TrustMockService;
exports.TrustMockService = TrustMockService = TrustMockService_1 = __decorate([
    (0, common_1.Injectable)()
], TrustMockService);
//# sourceMappingURL=trust.mock.service.js.map