import { AdminAction } from 'src/api/admin/admin-permission.interface';
import { RoleAction } from 'src/api/role/role-permission.interface';
import { UploadAction } from 'src/api/upload/upload-permission.interface';
import { connectSource } from 'src/config/database.config';
import { RoleCode } from 'src/constant/role';
import { Admin } from 'src/entities/admin.entity';
import { Permission } from 'src/entities/permission.entity';
import { RolePermission } from 'src/entities/role-permission.entity';
import { Role } from 'src/entities/role.entity';
import { AdminData } from './data/admin-data';
import { PermissionData } from './data/permission-data';
import { RoleData } from './data/role-data';

const PermissionAdminRoleCode = [
  ...Object.values(AdminAction),
  ...Object.values(RoleAction),
  ...Object.values(UploadAction),
];

const PermissionManagerRoleCode = [
  AdminAction.GetProfile,
  AdminAction.GetAll,
  AdminAction.GetDetail,
  UploadAction.Image,
];

const PermissionUserRoleCode = [
  AdminAction.GetProfile,
  UploadAction.Image,
];

const seedingEntity = async (Entity: any, Data: any[], uniqueKey = '') => {
  console.log(`======== SEEDING ${Entity.name} =========`);
  for (const item of Data) {
    const conditionObj = uniqueKey ? { [uniqueKey]: item[uniqueKey] } : { id: item.id };
    const existEntity = await Entity.findOneBy(conditionObj);
    if (existEntity) {
      console.log(`======== ${Entity.name} ${uniqueKey || 'ID'} ${item[uniqueKey] || existEntity.id} is exist =========`);
      continue;
    }
    await Entity.save(item);
  }
};

const seedingRolePermission = async (permissionCodes: string[], roleCode: string) => {
  console.log(`======== SEEDING Permissions for Role ${roleCode} =========`);
  for (const code of permissionCodes) {
    const role = await Role.findOneBy({ code: roleCode });
    if (!role) {
      console.log(`======== ${Role.name} code ${roleCode} is not exist`);
      continue;
    }

    const permission = await Permission.findOneBy({ code });
    if (!permission) {
      console.log(`======== ${Permission.name} code ${code} is not exist`);
      continue;
    }

    const rolePermission = await RolePermission.findOneBy({ roleId: role.id, permissionId: permission.id });
    if (rolePermission) {
      continue;
    }

    await RolePermission.save({ roleId: role.id, permissionId: permission.id } as Partial<RolePermission>);
  }
};

const defaultSeeding = async () => {
  try {
    await connectSource();

    await seedingEntity(Permission, PermissionData, 'code');
    await seedingEntity(Role, RoleData, 'code');
    await seedingEntity(Admin, AdminData, 'username');

    await seedingRolePermission(PermissionAdminRoleCode, RoleCode.ADMIN_SYSTEM);
    await seedingRolePermission(PermissionManagerRoleCode, RoleCode.MANAGER);
    await seedingRolePermission(PermissionUserRoleCode, RoleCode.USER);

    console.log('======== SEEDING COMPLETED SUCCESSFULLY ========');
    process.exit(0);
  } catch (error) {
    console.error('======== SEEDING FAILED ========', error);
    process.exit(1);
  }
};

defaultSeeding();
