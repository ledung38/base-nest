import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAction } from 'src/api/admin/admin-permission.interface';
import { RoleAction } from 'src/api/role/role-permission.interface';
import { UploadAction } from 'src/api/upload/upload-permission.interface';
import { CacheAdmin } from 'src/dto/common-request.dto';

export type AppAction = AdminAction | RoleAction | UploadAction | string;

export const PERMISSION_KEY = 'PERMISSION_KEY';

export const AppPermission = (permission: AppAction) => SetMetadata(PERMISSION_KEY, permission);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission =
      this.reflector.getAllAndOverride<AppAction>(PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || (context.getHandler().name as AppAction);

    if (!requiredPermission) {
      return true;
    }

    const user: CacheAdmin = context.switchToHttp().getRequest()?.user;
    if (!user) return false;
    if (user.isSupperAdmin) return true;

    return user.actions?.includes(requiredPermission as string) ?? false;
  }
}
