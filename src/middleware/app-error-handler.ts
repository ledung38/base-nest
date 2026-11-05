import { ArgumentsHost, BadRequestException, Catch, HttpException, HttpServer, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';
import { isArray } from 'lodash';
import { AppError, ERROR_MSG, IAppError } from 'src/constant/error';
import { RequestAuth } from 'src/dto/common-request.dto';
import { winstonLogger } from 'src/logger';

export class AppException extends HttpException {
  public errorCode: string;
  constructor(err: ERROR_MSG | IAppError, message?: string) {
    const errObj: IAppError = typeof err === 'string' ? AppError[err] || {
      code: err,
      message: err,
      status: HttpStatus.BAD_REQUEST,
    } : err;

    const { status, ...error } = errObj;

    if (message) error.message = message;
    super(error, status);
    this.errorCode = error.code;
  }
}

export class App404Exception extends AppException {
  public errorCode: string;
  constructor(key: string, body: any) {
    super({
      message: `${body?.[key] ?? key} not found`,
      code: `${key.toUpperCase()}_NOT_FOUND`,
      status: HttpStatus.NOT_FOUND,
    });
  }
}

export class AppExistedException extends AppException {
  public errorCode: string;
  constructor(key: string, body: any) {
    super({
      message: `${body?.[key] ?? key} already exists`,
      code: `${key.toUpperCase()}_ALREADY_EXISTS`,
      status: HttpStatus.CONFLICT,
    });
  }
}

export function AppCatchAxiosException(e: any) {
  if (e?.response?.data) {
    const logs = typeof e?.response?.data === 'string' ? e?.response?.data.split('</html>') : [JSON.stringify(e.response.data)];
    if (logs?.length > 1) winstonLogger.error(logs[1]);
    else winstonLogger.error(logs[0]);
  } else {
    winstonLogger.error(e);
  }
}

@Catch()
export class AppErrorHandler extends BaseExceptionFilter {
  constructor(applicationRef?: HttpServer) {
    super(applicationRef);
  }

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response: any = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestAuth>();

    let tracePositionError = '';
    if (exception?.stack && typeof exception.stack === 'string') {
      exception.stack
        .split('\n')
        .slice(1)
        .map((r: string) => r.match(/\((?<file>.*):(?<line>\d+):(?<pos>\d+)\)/))
        .forEach((r: any) => {
          if (r && r.groups && !r.groups.file.startsWith('internal')) {
            const { file, line, pos } = r.groups;
            tracePositionError += `\n${file} at ${line}:${pos}`;
          }
        });
    }

    const status = exception?.getStatus ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = '';
    if (exception?.getResponse) {
      const res = exception.getResponse();
      message = typeof res === 'object' ? (res as any).message || JSON.stringify(res) : res;
    } else {
      message = exception?.message || exception?.toString() || 'Internal server error';
    }

    let code: string | null = null;
    if (exception instanceof BadRequestException) {
      code = BadRequestException.name;
    } else if (exception instanceof AppException) {
      code = exception.errorCode;
    } else {
      code = exception?.response?.error || 'INTERNAL_ERROR';
    }

    const errorResponse = {
      status,
      data: {
        status,
        message,
        code,
      } as IAppError,
    };

    if (isArray(errorResponse.data.message)) {
      errorResponse.data.message = errorResponse.data.message[0];
    }

    const logMsg = `${request?.method ?? 'UNKNOWN'} ${request?.url ?? ''} ${JSON.stringify(errorResponse)} ${tracePositionError}`;

    if (status >= 500) {
      winstonLogger.error(logMsg);
    } else {
      winstonLogger.warn(logMsg);
    }

    return response?.status(status).json(errorResponse);
  }
}
