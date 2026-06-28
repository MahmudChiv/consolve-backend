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
exports.SearchDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
class SearchDto {
    query;
    latitude;
    longitude;
}
exports.SearchDto = SearchDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Natural language search query (English or Pidgin)',
        example: 'Find me a trusted tailor near Lagos who makes senator wear',
        minLength: 3,
        maxLength: 500,
    }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3, { message: 'Query must be at least 3 characters' }),
    (0, class_validator_1.MaxLength)(500, { message: 'Query must be at most 500 characters' }),
    __metadata("design:type", String)
], SearchDto.prototype, "query", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: "User's current latitude for distance calculation",
        example: 6.5244,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsLatitude)({ message: 'latitude must be a valid latitude (-90 to 90)' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SearchDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: "User's current longitude for distance calculation",
        example: 3.3792,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsLongitude)({ message: 'longitude must be a valid longitude (-180 to 180)' }),
    (0, class_transformer_1.Type)(() => Number),
    __metadata("design:type", Number)
], SearchDto.prototype, "longitude", void 0);
//# sourceMappingURL=search.dto.js.map