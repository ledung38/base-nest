import { HttpStatus } from '@nestjs/common';

export interface IAppError {
  code: string;
  message: string;
  status: HttpStatus;
}

export enum ERROR_MSG {
  // AUTH MSG
  AUTH_UNAUTHORIZED_TOKEN = 'AUTH_UNAUTHORIZED_TOKEN',
  AUTH_TOKEN_CLAIMS_BEFORE = 'AUTH_TOKEN_CLAIMS_BEFORE',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_FORBIDDEN_ACCOUNT = 'AUTH_FORBIDDEN_ACCOUNT',

  // LOGIC MESSAGE
  PASSWORD_NOT_CORRECT = 'PASSWORD_NOT_CORRECT',
  OLD_PASSWORD_NOT_CORRECT = 'OLD_PASSWORD_NOT_CORRECT',
  HAVE_NOT_ANY_CHANGE = 'HAVE_NOT_ANY_CHANGE',
  USER_NAME_EXISTED = 'USER_NAME_EXISTED',
  EMAIL_EXISTED = 'EMAIL_EXISTED',
  ROLE_IS_NOT_EXIST = 'ROLE_IS_NOT_EXIST',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
}

export const AppError: Record<ERROR_MSG, IAppError> = Object.freeze({
  // AUTH
  [ERROR_MSG.AUTH_TOKEN_CLAIMS_BEFORE]: {
    code: ERROR_MSG.AUTH_TOKEN_CLAIMS_BEFORE,
    message: 'Your token has been claims before create',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ERROR_MSG.AUTH_TOKEN_EXPIRED]: {
    code: 'AUTH_TOKEN_EXPIRED',
    message: 'Your token have been expired',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ERROR_MSG.AUTH_TOKEN_INVALID]: {
    code: 'AUTH_TOKEN_INVALID',
    message: 'Your token is invalid',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ERROR_MSG.AUTH_UNAUTHORIZED_TOKEN]: {
    code: 'AUTH_UNAUTHORIZED_TOKEN',
    message: 'Unauthorized token',
    status: HttpStatus.UNAUTHORIZED,
  },
  [ERROR_MSG.AUTH_FORBIDDEN_ACCOUNT]: {
    code: 'AUTH_FORBIDDEN_ACCOUNT',
    message: 'Access denied',
    status: HttpStatus.FORBIDDEN,
  },

  // COMMON LOGIC
  [ERROR_MSG.PASSWORD_NOT_CORRECT]: {
    code: 'PASSWORD_NOT_CORRECT',
    message: 'Password not correct',
    status: HttpStatus.BAD_REQUEST,
  },
  [ERROR_MSG.OLD_PASSWORD_NOT_CORRECT]: {
    code: 'OLD_PASSWORD_NOT_CORRECT',
    message: 'Old password not correct',
    status: HttpStatus.BAD_REQUEST,
  },
  [ERROR_MSG.HAVE_NOT_ANY_CHANGE]: {
    code: 'HAVE_NOT_ANY_CHANGE',
    message: 'No changes detected',
    status: HttpStatus.BAD_REQUEST,
  },
  [ERROR_MSG.USER_NAME_EXISTED]: {
    code: 'USER_NAME_EXISTED',
    message: 'Username already exists',
    status: HttpStatus.CONFLICT,
  },
  [ERROR_MSG.EMAIL_EXISTED]: {
    code: 'EMAIL_EXISTED',
    message: 'Email already exists',
    status: HttpStatus.CONFLICT,
  },
  [ERROR_MSG.ROLE_IS_NOT_EXIST]: {
    code: 'ROLE_IS_NOT_EXIST',
    message: 'Role does not exist',
    status: HttpStatus.NOT_FOUND,
  },
  [ERROR_MSG.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    status: HttpStatus.NOT_FOUND,
  },
  [ERROR_MSG.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: 'Bad request',
    status: HttpStatus.BAD_REQUEST,
  },
});
