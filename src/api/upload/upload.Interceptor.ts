import { applyDecorators, ParseFilePipe, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { MulterError } from 'multer';
import { UploadConst } from 'src/constant/upload';
import { FileUtils } from 'src/utils/file';

export function UploadImageFormData({ maxCount = 1 }) {
  return applyDecorators(
    ApiConsumes('multipart/form-data'),
    UseInterceptors(
      FileFieldsInterceptor([{ name: 'uploadFiles', maxCount: maxCount }], {
        fileFilter: (_req, file, cb) => {
          if (file.originalname.toLocaleLowerCase().match(/^.*\.(jpg|webp|png|jpeg|heic)$/)) cb(null, true);
          else {
            cb(new MulterError('LIMIT_UNEXPECTED_FILE', 'uploadFiles'), false);
          }
        },
        limits: { fileSize: FileUtils.genMBToBytes(UploadConst.maxFileImageSize) },
      }),
    ),
  );
}

export function UploadFilesRequire() {
  return applyDecorators(
    UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    ) as any,
  );
}
