import { Transform } from 'class-transformer';
import { IsSwaggerString } from 'src/decorator/swagger.decorator';
import { AbstractTimeEntity } from 'src/entities/entity.interface';
import { PageOptionsDto } from '../paginate.dto';

export class GetAllAdminDto extends PageOptionsDto {
  @IsSwaggerString({}, false)
  @Transform(({ value }) => value.trim())
  readonly fullName: string;

  @IsSwaggerString({}, false)
  @Transform(({ value }) => value.trim())
  readonly phoneNumber: string;

  @IsSwaggerString({}, false)
  @Transform(({ value }) => value.trim())
  readonly email: string;
}

export class GetAllAdminResponse extends AbstractTimeEntity {
  @IsSwaggerString()
  username: string;

  @IsSwaggerString()
  fullName: string;

  @IsSwaggerString()
  email: string;

  @IsSwaggerString()
  phoneNumber: string;
}
