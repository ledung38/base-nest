import { ApiProperty } from '@nestjs/swagger';
import { UploadImageType } from 'src/constant/upload';
import { IsSwaggerEnum } from 'src/decorator/swagger.decorator';

export class UploadImageDto {
  @ApiProperty({
    type: 'file',
    format: 'binary',
    required: false,
    isArray: true,
  })
  readonly uploadFiles: Express.Multer.File[];

  @IsSwaggerEnum({ enum: UploadImageType })
  readonly type: UploadImageType;
}
