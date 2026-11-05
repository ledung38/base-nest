import { Permission } from 'src/entities/permission.entity';

export enum AdminAction {
  GetProfile = 'admin__GetProfile',
  GetAll = 'admin__GetAll',
  Create = 'admin__Create',
  GetDetail = 'admin__GetDetail',
  Delete = 'admin__Delete',
}

export const AdminSummary: Record<keyof typeof AdminAction, string> = {
  GetProfile: 'Get admin profile',
  GetAll: 'Get all admin profile',
  Create: 'Create new admin account',
  GetDetail: 'Get detail admin account',
  Delete: 'Delete a admin',
};

export const AdminPermission: Partial<Permission>[] = Object.keys(AdminAction).map((key) => ({
  code: AdminAction[key],
  name: AdminSummary[key],
}));
