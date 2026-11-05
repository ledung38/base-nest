import { RoleCode } from 'src/constant/role';
import { Admin } from 'src/entities/admin.entity';

export class AdminHelper {
  isAdminRole = (roleCode: string) => roleCode === RoleCode.ADMIN_SYSTEM;

  isUserNameExisted = async (username: string) => {
    return await Admin.existsBy({ username });
  };

  isEmailExisted = async (email: string) => {
    return await Admin.existsBy({ email });
  };
}

export const adminHelper = new AdminHelper();
