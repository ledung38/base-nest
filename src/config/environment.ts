import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env' });

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 8000,
  TIME_ZONE: process.env.TIME_ZONE || 'Asia/Ho_Chi_Minh',
  API_KEY: process.env.API_KEY || 'default-api-key-change-me',
  DATABASE: {
    DB_TYPE: process.env.DB_TYPE || 'postgres',
    DB_HOST: process.env.DB_HOST || 'localhost',
    DB_PORT: Number(process.env.DB_PORT) || 5432,
    DB_USERNAME: process.env.DB_USERNAME || 'postgres',
    DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
    DB_NAME: process.env.DB_NAME || 'fintrade_db',
  },
  REDIS: {
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: Number(process.env.REDIS_PORT) || 6379,
    REDIS_TTL_USER_AUTH: Number(process.env.REDIS_TTL_USER_AUTH) || 86400,
  },
  RABBITMQ: {
    URI: process.env.RABBITMQ_URI || 'amqp://guest:guest@localhost:5672',
    USER: process.env.RABBITMQ_USER || 'guest',
    PASS: process.env.RABBITMQ_PASS || 'guest',
    PORT: Number(process.env.RABBITMQ_PORT) || 5672,
    MGMT_PORT: Number(process.env.RABBITMQ_MGMT_PORT) || 15672,
    ORDER_QUEUE: 'orders.queue',
    ORDER_DLQ: 'orders.dlq',
    EVENT_EXCHANGE: 'fintrade.events',
  },
  KAFKA: {
    BROKERS: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'fintrade-engine',
    GROUP_ID: process.env.KAFKA_GROUP_ID || 'fintrade-group',
    TOPICS: {
      MARKET_TICKS: 'market.ticks',
      MARKET_CANDLES: 'market.candles',
      SIGNALS: 'trading.signals',
    },
  },
  CENTRIFUGO: {
    API_URL: process.env.CENTRIFUGO_API_URL || 'http://localhost:8001/api',
    API_KEY: process.env.CENTRIFUGO_API_KEY || 'fintrade-centrifugo-api-key',
    TOKEN_SECRET: process.env.CENTRIFUGO_TOKEN_SECRET || 'fintrade-centrifugo-hmac-secret-key',
    ADMIN_PASSWORD: process.env.CENTRIFUGO_ADMIN_PASSWORD || 'Admin@123',
    ADMIN_SECRET: process.env.CENTRIFUGO_ADMIN_SECRET || 'fintrade-centrifugo-admin-secret',
    PORT: Number(process.env.CENTRIFUGO_PORT) || 8001,
  },
  BINANCE: {
    WS_URL: process.env.BINANCE_WS_URL || 'wss://stream.binance.com:9443/ws',
    SYMBOLS: (process.env.BINANCE_SYMBOLS || 'btcusdt,ethusdt,solusdt').split(','),
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
