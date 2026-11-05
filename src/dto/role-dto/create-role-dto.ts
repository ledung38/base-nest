import { IsSwaggerString } from 'src/decorator/swagger.decorator';

export class CreateRoleDto {
  @IsSwaggerString()
  code: string;

  @IsSwaggerString({ maxLength: 50 })
  name: string;
}
