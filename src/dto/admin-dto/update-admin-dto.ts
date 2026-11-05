import { IsDate } from 'class-validator';
import { Gender } from 'src/constant/enum-common';
import { IsSwaggerDate, IsSwaggerEnum, IsSwaggerString } from 'src/decorator/swagger.decorator';

export class UpdateAdminDto {
  @IsSwaggerString({ default: 'Du' }, false)
  readonly firstName: string;

  @IsSwaggerString({ default: 'Le' }, false)
  readonly lastName: string;

  @IsSwaggerString({ default: 'Le Huy Du' }, false)
  readonly fullName: string;

  @IsSwaggerDate({ example: '1999-11-18' }, false)
  @IsDate()
  readonly dateOfBirth: Date;

  @IsSwaggerEnum({ enum: Gender }, false)
  readonly gender: Gender;
}
