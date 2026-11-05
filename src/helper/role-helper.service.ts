import { Role } from 'src/entities/role.entity';

class RoleHelper {
  isExistRoleByCode = async (code: string) => {
    return await Role.existsBy({ code });
  };

  getRoleByCode = async (code: string) => {
    return await Role.findOneBy({ code });
  };
}

export const roleHelper = new RoleHelper();
