import { IsSwaggerString } from 'src/decorator/swagger.decorator';

export class ChangePasswordAdminDto {
  @IsSwaggerString({ default: '12345' })
  readonly oldPassword: string;

  @IsSwaggerString({ default: '123456' })
  readonly newPassword: string;
}

// export class LoginUserResponse {
//   @IsSwaggerString({ default: 'abc-xyz' })
//   readonly token: string;
// }
