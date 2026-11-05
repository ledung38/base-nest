import { Module } from '@nestjs/common';
import { RolePermissionController } from './role-permission.controller';
import { RoleService } from './role.service';

@Module({
  providers: [RoleService],
  controllers: [RolePermissionController],
})
export class RoleModule {}
