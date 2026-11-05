import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { exec } from 'child_process';
import { statSync } from 'fs';
import { hostname, tmpdir, userInfo } from 'os';
import { join } from 'path';
import { ENV } from 'src/config/environment';
import { winstonLogger } from 'src/logger';
import { S3Storage } from 'src/utils/s3-storage';
import { StorageUtil } from 'src/utils/storage';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createReadStream } = require('fs');

@Injectable()
export class CronBackupDatabase {
  private readonly pgDumpUrl = `postgres://${ENV.DATABASE.DB_USERNAME}:${ENV.DATABASE.DB_PASSWORD}@${ENV.DATABASE.DB_HOST}:${ENV.DATABASE.DB_PORT}/${ENV.DATABASE.DB_NAME}`;

  @Cron(ENV.JOB.CRON_BACKUP_DATABASE_EXPRESSION, { timeZone: ENV.TIME_ZONE })
  async handleJob() {
    winstonLogger.info('Initiating DB backup...');
    const date = new Date().toISOString();
    const timestamp = date.replace(/[:.]+/g, '-');
    const filename = `backup-${timestamp}-${userInfo().username}.${hostname()}.dump`;
    const filepath = join(tmpdir(), filename);
    winstonLogger.info(`File name: ${filename}`);
    winstonLogger.info(`Temporary folder path: ${filepath}`);
    await this.dumpToFile(filepath);
    console.info('Uploading backup to S3...');
    const s3 = new S3Storage();
    await s3.upload({
      buffer: createReadStream(filepath),
      s3path: StorageUtil.getDbBackupPath(filename),
      isPublic: false,
    });
    console.info('Backup uploaded to S3...');
    winstonLogger.info('Deleting file...');
    await StorageUtil.deleteFile(filepath);
    winstonLogger.info('DB backup complete...');
  }

  dumpToFile = async (path: string) => {
    winstonLogger.info('Dumping DB to file...');
    await new Promise((resolve, reject) => {
      exec(`pg_dump -F c ${this.pgDumpUrl} > ${path}`, (error, stdout, stderr) => {
        if (error) {
          reject({ error: error, stderr: stderr.trimEnd() });
          return;
        }
        if (stderr != '') {
          reject({ stderr: stderr.trimEnd() });
          return;
        }
        winstonLogger.info(`Backup size: ${statSync(path).size} bytes`);
        resolve(undefined);
      });
    });
    winstonLogger.info('DB dumped to file...');
  };
}
