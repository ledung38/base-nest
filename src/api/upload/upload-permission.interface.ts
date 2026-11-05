import { Permission } from 'src/entities/permission.entity';

export enum UploadAction {
  Image = 'upload__Image',
  // GetAll = 'upload__GetAll',
  // GetMyUploads = 'upload__GetMyUploads',
}

export const UploadSummary: Record<keyof typeof UploadAction, string> = {
  Image: 'Upload a image to storage',
  // GetAll: 'Get all upload on system',
  // GetMyUploads: 'Get my upload list',
};

export const UploadPermission: Partial<Permission>[] = Object.keys(UploadAction).map((key) => ({
  code: UploadAction[key],
  name: UploadSummary[key],
}));
