import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { UploadConst, UploadImageType } from 'src/constant/upload';
import { GetUploadListResponse } from 'src/dto/common-response.dto';
import { PageDto, PageMetaDto } from 'src/dto/paginate.dto';
import { GetAllUploadDto } from 'src/dto/upload-dto/get-all-upload-dto';
import { UploadImageDto } from 'src/dto/upload-dto/upload-image-dto';
import { Upload } from 'src/entities/upload.entity';
import { QueryUtil } from 'src/utils/query';
import { S3Storage } from 'src/utils/s3-storage';

@Injectable()
export class UploadService {
  getImagePath = (type: UploadImageType, fileName: string) => {
    switch (type) {
      case UploadImageType.AVATAR:
        return `${UploadConst.dirAvatar}/${fileName}`;
      case UploadImageType.DOCUMENT:
        return `${UploadConst.dirDocument}/${fileName}`;
      case UploadImageType.THUMBNAIL:
        return `${UploadConst.dirThumbnail}/${fileName}`;
      case UploadImageType.OTHER:
      default:
        return `${UploadConst.dirOther}/${fileName}`;
    }
  };

  uploadImage = async (creatorId: number, body: UploadImageDto, image: Express.Multer.File) => {
    const extName = path.extname(image.originalname);
    const uploadName = path.parse(image.originalname).name.replace(/\s+/g, '_');
    const randName = `${Date.now()}${Math.random().toString().substring(2, 8)}`;
    const fileName = `${uploadName}-${randName}${extName}`;
    const pathImage = this.getImagePath(body.type, fileName);

    await Upload.save({ path: pathImage, creatorId });

    const s3 = new S3Storage();
    await s3.upload({ buffer: image.buffer, s3path: pathImage, ContentType: image.mimetype });
    return pathImage;
  };

  getAll = async (
    query: GetAllUploadDto,
    { creatorId }: { creatorId?: number } = {},
  ): Promise<PageDto<GetUploadListResponse>> => {
    let where = {};

    if (creatorId) {
      where = { ...where, creatorId };
    }

    const [data, itemCount] = await Upload.findAndCount({
      where,
      select: {
        createdAt: true,
        path: true,
        isActive: true,
        creator: {
          id: true,
          fullName: true,
        },
      },
      order: QueryUtil.getSort(query.orderBy, query.sortBy),
      skip: query.skip,
      take: query.take,
      relations: {
        creator: true,
      },
    });

    const pageMetaDto = new PageMetaDto({
      itemCount,
      pageOptionsDto: query,
    });

    return new PageDto(data as any, pageMetaDto);
  };
}
