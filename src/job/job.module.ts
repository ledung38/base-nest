import { Module } from '@nestjs/common';
import { CronCleanStorage } from './cron-clean-storage';
import { CronBackupDatabase } from './cron-backup-db';

@Module({
  providers: [CronCleanStorage, CronBackupDatabase],
})
export class JobModule {}
