import { Role } from 'src/entities/role.entity';

export class ExtractUtil {
  static roleActions = async (role: Role) => {
    const actions = [];
    if (role) {
      actions.push(
        ...role.rolePermissions.filter((item) => item.permission.isActive).map((item) => item.permission.code),
      );
    }
    return actions;
  };
}
