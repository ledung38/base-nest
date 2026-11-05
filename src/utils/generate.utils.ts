import { JWTPayload } from 'src/dto/common-request.dto';

export class GenerateUtil {
  static keyAuth = (payload: JWTPayload) => `auth_${payload.sub}_${payload.username}`;

  static fullName = (firstName: string, lastName: string) => `${firstName} ${lastName}`;
}
