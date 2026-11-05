import { AdminPermission } from 'src/api/admin/admin-permission.interface';
import { RolePermission } from 'src/api/role/role-permission.interface';
import { UploadPermission } from 'src/api/upload/upload-permission.interface';
import { Permission } from 'src/entities/permission.entity';

export const PermissionData: Partial<Permission>[] = [
  ...AdminPermission,
  ...UploadPermission,
  ...RolePermission,
];
