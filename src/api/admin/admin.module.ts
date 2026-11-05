import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminPermissionController } from './admin-permission.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [AdminService],
  controllers: [AdminController, AdminPermissionController],
})
export class AdminModule {}
