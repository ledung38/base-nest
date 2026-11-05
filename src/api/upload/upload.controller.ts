import { Body, ParseFilePipe, Post, Request, UploadedFiles } from '@nestjs/common';
import { EntityNameConst } from 'src/constant/entity-name';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { RequestAuth } from 'src/dto/common-request.dto';
import { UploadImageDto } from 'src/dto/upload-dto/upload-image-dto';
import { UploadAction } from './upload-permission.interface';
import { UploadImageFormData } from './upload.Interceptor';
import { UploadService } from './upload.service';

@IsAuthController(EntityNameConst.UPLOAD, 'Upload', true)
export class UploadController implements Record<UploadAction, any> {
  constructor(private readonly uploadService: UploadService) {}

  // @Get('/system-uploads')
  // @ApiPaginatedResponse(GetUploadListResponse, UploadSummary.GetAll)
  // async [UploadAction.GetAll](@Query() query: GetAllUploadDto) {
  //   return this.uploadService.getAll(query);
  // }

  // @Get('/my-uploads')
  // @ApiPaginatedResponse(GetUploadListResponse, UploadSummary.GetMyUploads)
  // async [UploadAction.GetMyUploads](@Request() req: RequestAuth, @Query() query: GetAllUploadDto) {
  //   return this.uploadService.getAll(query, { creatorId: req.user.userId });
  // }

  @Post('/image')
  @UploadImageFormData({})
  @ApiHandleResponse({ summary: 'upload a image to storage', type: String })
  async [UploadAction.Image](
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: true,
      }),
    )
    { uploadFiles },
    @Request() req: RequestAuth,
    @Body() body: UploadImageDto,
  ) {
    return this.uploadService.uploadImage(req.user.userId, body, uploadFiles[0]);
  }
}
