export enum UploadImageType {
  AVATAR = 'AVATAR',
  DOCUMENT = 'DOCUMENT',
  THUMBNAIL = 'THUMBNAIL',
  OTHER = 'OTHER',
}

export const UploadConst = Object.freeze({
  maxFileImageSize: 10, // MB
  dirAvatar: `images/avatar`,
  dirDocument: `images/document`,
  dirThumbnail: `images/thumbnail`,
  dirOther: `images/other`,
});
