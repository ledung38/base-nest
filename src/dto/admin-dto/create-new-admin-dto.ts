import { IsSwaggerString } from 'src/decorator/swagger.decorator';

export class CreateNewAdminDto {
  @IsSwaggerString({ default: 'Le Huy Du' })
  readonly fullName: string;

  @IsSwaggerString({ default: 'dusainbolt' })
  readonly username: string;

  @IsSwaggerString({ default: '+84328111597' }, false)
  readonly phoneNumber: string;

  @IsSwaggerString({ default: 'dulh181199@gmail.com' }, false)
  readonly email: string;

  @IsSwaggerString({ default: '123456' })
  readonly password: string;

  @IsSwaggerString({ default: 'Cau Giay - Ha Noi - Viet Nam' }, false)
  readonly address: string;
}
