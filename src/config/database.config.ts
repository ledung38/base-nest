import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENV } from './environment';

const config: DataSourceOptions = {
  type: ENV.DATABASE.DB_TYPE as any,
  host: ENV.DATABASE.DB_HOST,
  port: ENV.DATABASE.DB_PORT,
  username: ENV.DATABASE.DB_USERNAME,
  password: ENV.DATABASE.DB_PASSWORD,
  database: ENV.DATABASE.DB_NAME,
  entities: [join(__dirname, '/../**/**.entity{.ts,.js}')],
  migrations: ['dist/migrations/*{.ts,.js}'],
  synchronize: false,
};

export const dataSource = new DataSource(config as DataSourceOptions);

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    return config;
  }
}

export const dataSourceFactory = async (options) => {
  const dataSource = await new DataSource(options).initialize();
  return dataSource;
};

export const connectSource = async () => {
  if (dataSource.isInitialized) {
    return;
  }
  await dataSource.initialize();
  console.log(`======== Connect ${dataSource.options.database} data source successful ========`);
};
