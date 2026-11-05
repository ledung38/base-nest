import { RoleCode } from 'src/constant/role';
import { Role } from 'src/entities/role.entity';

export const RoleData: Partial<Role>[] = [
  {
    code: RoleCode.ADMIN_SYSTEM,
    name: 'System Administrator',
  },
  {
    code: RoleCode.MANAGER,
    name: 'Manager',
  },
  {
    code: RoleCode.USER,
    name: 'User',
  },
];
