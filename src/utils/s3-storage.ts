import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { winstonLogger } from 'src/logger';
import { ENV } from '../config/environment';

export class S3Storage {
  private bucket: string;
  private client: S3Client;

  constructor(_bucket = ENV.AWS.AWS_S3_BUCKET_NAME) {
    this.bucket = _bucket;
    this.client = new S3Client({
      region: ENV.AWS.AWS_REGION,
      endpoint: ENV.AWS.AWS_ENDPOINT || undefined,
      credentials: {
        accessKeyId: ENV.AWS.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: ENV.AWS.AWS_SECRET_KEY || '',
      },
    });
  }

  async upload({
    buffer,
    s3path,
    isPublic = true,
    ContentType,
  }: {
    buffer: Buffer;
    s3path: string;
    isPublic?: boolean;
    ContentType?: any;
  }) {
    return await this.client.send(
      new PutObjectCommand({
        ACL: isPublic ? 'public-read' : undefined,
        ContentType,
        Bucket: this.bucket,
        Key: s3path,
        Body: buffer,
      }),
    );
  }

  async read(path: string) {
    const params = { Bucket: this.bucket, Key: path };
    const res = await this.client.send(new GetObjectCommand(params));
    return await (res.Body as any)?.transformToString();
  }

  async delete(path: string) {
    try {
      const params = { Bucket: this.bucket, Key: path };
      await this.client.send(new HeadObjectCommand(params));
      try {
        await this.client.send(new DeleteObjectCommand(params));
        return true;
      } catch (err) {
        winstonLogger.error(`ERROR in file Deleting : ${path} ` + JSON.stringify(err));
      }
    } catch (err) {
      winstonLogger.error('File not Found ERROR : ' + path);
    }
    return false;
  }

  getS3FullUrl = (path: string) => {
    if (ENV.AWS.AWS_ENDPOINT) {
      return `${ENV.AWS.AWS_ENDPOINT}/${this.bucket}/${path}`;
    }
    return `https://${this.bucket}.s3.${ENV.AWS.AWS_REGION}.amazonaws.com/${path}`;
  };
}
