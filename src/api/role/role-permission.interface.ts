import { Permission } from 'src/entities/permission.entity';

export enum RoleAction {
  Create = 'role__Create',
  Update = 'role__Update',
  Active = 'role__Active',
  UnActive = 'role__UnActive',
  Delete = 'role__Delete',
}

export const RoleSummary: Record<keyof typeof RoleAction, string> = {
  Create: 'Create new role',
  Update: 'Update a role',
  Active: 'Active a role',
  UnActive: 'UnActive a role',
  Delete: 'Delete a role',
};

export const RolePermission: Partial<Permission>[] = Object.keys(RoleAction).map((key) => ({
  code: RoleAction[key],
  name: RoleSummary[key],
}));
