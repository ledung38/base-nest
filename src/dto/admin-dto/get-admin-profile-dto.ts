import { IsSwaggerString } from 'src/decorator/swagger.decorator';
import { GetAllAdminResponse } from './get-all-admin-dto';

export class GetAdminProfileResponse extends GetAllAdminResponse {
  @IsSwaggerString()
  password: string;

  @IsSwaggerString()
  address: string;
}
