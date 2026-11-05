import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ENV } from 'src/config/environment';
import { UploadCleanHistory } from 'src/entities/upload-clean-history.entity';
import { uploadHelper } from 'src/helper/upload-helper.service';
import { winstonLogger } from 'src/logger';
import { S3Storage } from 'src/utils/s3-storage';

@Injectable()
export class CronCleanStorage {
  @Cron(ENV.JOB.CRON_CLEAN_STORAGE_EXPRESSION, { timeZone: ENV.TIME_ZONE })
  async handleJob() {
    try {
      const startAt = new Date();
      const uploadsClean = await uploadHelper.getUploadCleanData();

      const s3 = new S3Storage();
      let totalSuccess = 0;
      let totalError = 0;

      await Promise.all(
        uploadsClean.map(async (upload) => {
          const success = await s3.delete(upload.path);
          if (success) {
            totalSuccess++;
            upload.isActive = false;
            await upload.remove();
          } else {
            totalError++;
          }
        }),
      );

      await UploadCleanHistory.save({
        startAt,
        endAt: new Date(),
        totalError,
        totalSuccess,
      });
      winstonLogger.info('Remove list file not use successful');
    } catch (e) {
      winstonLogger.error(e);
    }
  }
}
