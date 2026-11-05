import { HttpStatus } from '@nestjs/common';
import { ENV } from 'src/config/environment';
import {
  IsSwaggerBoolean,
  IsSwaggerDateTime,
  IsSwaggerDto,
  IsSwaggerNumber,
  IsSwaggerString,
} from '../decorator/swagger.decorator';
import { JWTPayload } from './common-request.dto';

export class ErrorDataResponse {
  @IsSwaggerString({})
  code: string;

  @IsSwaggerString({})
  message: string;

  @IsSwaggerString({})
  error: HttpStatus;
}

export class DefaultResponse {
  @IsSwaggerNumber({})
  status: number;

  @IsSwaggerDto(ErrorDataResponse)
  data: ErrorDataResponse;
}

export class LoginResponse {
  @IsSwaggerDto(JWTPayload)
  payload: number;

  @IsSwaggerString({
    default:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImNyZWF0ZUF0IjoiMjAyNC0wMy0yMVQxNDo0OToyNC41ODRaIiwiaWF0IjoxNzExMDMyNTY0LCJleHAiOjE3MTE2MzczNjR9.fL37HAKp-s7IShQmDaB1C54ijhZlUQ1fIBtasnELyPE',
  })
  token: string;

  @IsSwaggerNumber({ default: ENV.JWT.JWT_EXPIRE_IN })
  expiresIn: number;
}

export class CreatorResponse {
  @IsSwaggerNumber()
  id: number;

  @IsSwaggerString()
  firstName: string;

  @IsSwaggerString()
  lastName: string;
}

export class GetUploadListResponse {
  @IsSwaggerDateTime()
  createdAt: string;

  @IsSwaggerString()
  path: string;

  @IsSwaggerBoolean()
  isActive: boolean;

  @IsSwaggerDto(CreatorResponse)
  creator: CreatorResponse;
}
