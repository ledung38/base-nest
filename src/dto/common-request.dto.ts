import { Request } from 'express';
import { IsSwaggerNumber, IsSwaggerString } from 'src/decorator/swagger.decorator';

export interface IRequestResponse<T> {
  status: '1' | '0';
  message: 'OK';
  result: T;
}

export class JWTPayload {
  @IsSwaggerNumber()
  sub: number;

  @IsSwaggerString()
  username: string;
}

export interface CacheAdmin {
  userId: number;
  username: string;
  fullName: string;
  roleId: number;
  roleName: string;
  roleCode: string;
  actions: string[];
  isSupperAdmin: boolean;
}
export interface RequestAuth extends Request {
  user: CacheAdmin;
}
