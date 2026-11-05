import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, NotBeforeError, TokenExpiredError } from 'jsonwebtoken';
import { ERROR_MSG } from 'src/constant/error';
import { CacheAdmin } from 'src/dto/common-request.dto';
import { AppException } from 'src/middleware/app-error-handler';

@Injectable()
export class AccessTokenGuard extends AuthGuard('jwt') {
  constructor() {
    super();
  }

  handleRequest<TUser = any>(
    err: any,
    auth: CacheAdmin,
    info: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: any,
  ): TUser {
    if (info instanceof TokenExpiredError) {
      throw new AppException(ERROR_MSG.AUTH_TOKEN_EXPIRED);
    }
    if (info instanceof NotBeforeError) {
      throw new AppException(ERROR_MSG.AUTH_TOKEN_CLAIMS_BEFORE);
    }
    if (info instanceof JsonWebTokenError) {
      throw new AppException(ERROR_MSG.AUTH_TOKEN_INVALID);
    }
    if (err || !auth) throw new AppException(ERROR_MSG.AUTH_UNAUTHORIZED_TOKEN);
    return auth as any;
  }
}
