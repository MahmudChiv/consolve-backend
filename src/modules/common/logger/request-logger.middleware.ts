/**
 * request-logger.middleware.ts
 *
 * Structured JSON request/response logger middleware.
 *
 * Applied globally in AppModule.configure() to every route. It logs one
 * JSON line per request on the `finish` event (i.e. after the response
 * headers have been flushed), capturing:
 *
 *  - method      HTTP verb (GET, POST, …)
 *  - url         Full request URL including query string
 *  - statusCode  HTTP response status (200, 401, 429, …)
 *  - duration    Round-trip time in milliseconds
 *  - ip          Client IP address
 *  - userAgent   Client User-Agent header
 *
 * The logger is tagged as 'HTTP' so log aggregation tools (Datadog, ELK)
 * can filter it separately from application logs.
 *
 * Note: We log on `res.on('finish')` rather than before next() so the
 * statusCode is available after the handler has written the response.
 */
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') ?? '';

    // Record the start time so we can compute request duration
    const startTime = Date.now();

    // Listen for when Express finishes writing the response
    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      // Emit a single structured JSON log line per request
      this.logger.log(
        JSON.stringify({
          method,
          url: originalUrl,
          statusCode,
          duration: `${duration}ms`,
          ip,
          userAgent,
        }),
      );
    });

    // Pass control to the next middleware / route handler
    next();
  }
}
