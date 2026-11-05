import { IsSwaggerString } from 'src/decorator/swagger.decorator';

export class LoginAdminDto {
  @IsSwaggerString({ default: 'dusainbolt' })
  readonly username: string;

  @IsSwaggerString({ default: '12345' })
  readonly password: string;
}
