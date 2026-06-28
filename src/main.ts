import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  // ── Cookie parser ──────────────────────────────────────────────────────────
  app.use(cookieParser());

  // ── WebSocket adapter (raw ws, not socket.io) ─────────────────────────────
  app.useWebSocketAdapter(new WsAdapter(app));

  // ── Global validation pipe ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // ── Swagger ────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
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

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Consolve API running on: http://0.0.0.0:${port}/api/v1`);
  console.log(`📚 Swagger docs at: http://0.0.0.0:${port}/api/docs`);
}

bootstrap();
