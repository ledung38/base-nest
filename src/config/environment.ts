import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env' });

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  TIME_ZONE: process.env.TIME_ZONE || 'Asia/Ho_Chi_Minh',
  API_KEY: process.env.API_KEY || 'default-api-key-change-me',
  DATABASE: {
    DB_TYPE: process.env.DB_TYPE || 'postgres',
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: Number(process.env.DB_PORT) || 5432,
    DB_USERNAME: process.env.DB_USERNAME || 'postgres',
    DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
    DB_NAME: process.env.DB_NAME || 'base_db',
  },
  REDIS: {
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
    REDIS_TTL_USER_AUTH: Number(process.env.REDIS_TTL_USER_AUTH) || 86400,
  },
  JWT: {
    JWT_SECRET: process.env.JWT_SECRET || 'super-jwt-secret-key-change-me-in-production',
    JWT_EXPIRE_IN: Number(process.env.JWT_EXPIRE_IN) || 86400,
  },
  AWS: {
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    AWS_ENDPOINT: process.env.AWS_ENDPOINT,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'app-bucket',
  },
  JOB: {
    CRON_CLEAN_STORAGE_EXPRESSION: process.env.CRON_CLEAN_STORAGE_EXPRESSION || '0 0 * * *',
    CRON_BACKUP_DATABASE_EXPRESSION: process.env.CRON_BACKUP_DATABASE_EXPRESSION || '0 2 * * *',
    CLEAN_STORAGE_THRESHOLD_SECOND: Number(process.env.CLEAN_STORAGE_THRESHOLD_SECOND) || 86400,
  },
};
