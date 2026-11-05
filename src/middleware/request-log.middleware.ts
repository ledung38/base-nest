import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ENV } from 'src/config/environment';
import { winstonLogger } from 'src/logger';

const SuccessStatusCode = [HttpStatus.CREATED, HttpStatus.OK];
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, baseUrl: url } = request;
    const userAgent = request.get('user-agent') || '';

    response.on('close', () => {
      const { statusCode } = response;

      const contentLength = response.get('content-length');

      if (SuccessStatusCode.includes(statusCode)) {
        winstonLogger.info(`${method} ${url} ${statusCode} ${contentLength} - ${userAgent} ${ip}`);
      }

      if (ENV.NODE_ENV !== 'development') {
        winstonLogger.info(
          `Request info\n- params: ${JSON.stringify(request.params)}\n- query: ${JSON.stringify(request.query)}\n- body: ${JSON.stringify(request.body)}`,
        );
      }
    });

    next();
  }
}
