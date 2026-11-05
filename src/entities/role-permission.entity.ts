import { EntityNameConst } from 'src/constant/entity-name';
import { BaseEntity, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';

@Entity(EntityNameConst.ROLE_PERMISSION)
export class RolePermission extends BaseEntity {
  @Column({ type: 'int', name: 'role_id', primary: true })
  roleId: number;

  @Column({ type: 'int', name: 'permission_id', primary: true })
  permissionId: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Permission, (permission: Permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @ManyToOne(() => Role, (role: Role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;
}
