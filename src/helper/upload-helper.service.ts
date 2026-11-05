import { ENV } from 'src/config/environment';
import { Upload } from 'src/entities/upload.entity';
import { LessThan } from 'typeorm';

class UploadHelper {
  isPathExisted = async (path: string) => {
    return await Upload.existsBy({ path });
  };

  getUploadCleanData = async (): Promise<Upload[]> => {
    const flagTime = Date.now() - ENV.JOB.CLEAN_STORAGE_THRESHOLD_SECOND * 1000;
    return await Upload.find({
      where: { createdAt: LessThan(new Date(flagTime)), isActive: false },
    });
  };
}
export const uploadHelper = new UploadHelper();
