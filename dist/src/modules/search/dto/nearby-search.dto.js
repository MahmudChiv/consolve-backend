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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NearbySearchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class NearbySearchDto {
    latitude;
    longitude;
    radius = 10;
    profession;
}
exports.NearbySearchDto = NearbySearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Searcher's latitude",
        example: 6.5244,
    }),
    (0, class_validator_1.IsLatitude)({ message: 'latitude must be a valid latitude (-90 to 90)' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NearbySearchDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: "Searcher's longitude",
        example: 3.3792,
    }),
    (0, class_validator_1.IsLongitude)({ message: 'longitude must be a valid longitude (-180 to 180)' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NearbySearchDto.prototype, "longitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Search radius in kilometres (default 10, max 100)',
        example: 10,
        default: 10,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], NearbySearchDto.prototype, "radius", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Filter by profession (optional)',
        example: 'tailor',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], NearbySearchDto.prototype, "profession", void 0);
//# sourceMappingURL=nearby-search.dto.js.map