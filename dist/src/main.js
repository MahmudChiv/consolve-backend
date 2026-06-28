"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const platform_ws_1 = require("@nestjs/platform-ws");
const cookieParser = require('cookie-parser');
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['log', 'warn', 'error', 'debug'],
    });
    app.use(cookieParser());
    app.useWebSocketAdapter(new platform_ws_1.WsAdapter(app));
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.setGlobalPrefix('api/v1');
    app.enableCors({
        origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
        credentials: true,
    });
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Consolve API')
        .setDescription('Authentication & User Profile service for Consolve')
        .setVersion('1.0')
        .addCookieAuth('access_token')
        .addCookieAuth('refresh_token')
        .addTag('Auth', 'Authentication endpoints')
        .addTag('User', 'User profile endpoints')
        .addTag('Onboarding', 'AI-driven onboarding — chat & voice')
        .addTag('Search', 'AI-powered provider search and matchmaking')
        .addTag('Bookings', 'Booking lifecycle — create, accept, complete, cancel, dispute, review')
        .addTag('Health', 'Health check endpoint')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup('api/docs', app, document, {
        swaggerOptions: {
            persistAuthorization: true,
        },
    });
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`🚀 Consolve API running on: http://localhost:${port}/api/v1`);
    console.log(`📚 Swagger docs at: http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map