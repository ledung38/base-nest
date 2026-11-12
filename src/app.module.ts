import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import { Inject, MiddlewareConsumer, Module, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as redisStore from 'cache-manager-redis-store';
import { AdminModule } from './api/admin/admin.module';
import { RoleModule } from './api/role/role.module';
import { UploadModule } from './api/upload/upload.module';
import { AccountModule } from './api/account/account.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { TypeOrmConfigService, dataSourceFactory } from './config/database.config';
import { ENV } from './config/environment';
import { JobModule } from './job/job.module';
import { winstonLogger } from './logger';
import { RequestLogMiddleware } from './middleware/request-log.middleware';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory,
    }),

    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: ENV.REDIS.REDIS_HOST,
      port: ENV.REDIS.REDIS_PORT,
    }),

    ScheduleModule.forRoot(),
    JobModule,

    AuthModule,
    AdminModule,
    RoleModule,
    UploadModule,
    AccountModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule implements OnModuleInit {
  constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager) {}

  async onModuleInit() {
    try {
      if (ENV.NODE_ENV !== 'development') {
        const keys = await this.cacheManager.keys();
        keys?.length && (await this.cacheManager.del(keys));
      }
    } catch (e) {
      winstonLogger.error(e);
    }
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLogMiddleware).forRoutes('*');
  }
}
