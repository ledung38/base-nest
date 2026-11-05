import { EntityNameConst } from 'src/constant/entity-name';
import { Column, Entity, OneToMany } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractTimeEntity } from './entity.interface';
import { RolePermission } from './role-permission.entity';

@Entity(EntityNameConst.ROLE)
export class Role extends AbstractTimeEntity {
  @Column({ type: 'varchar', name: 'code', unique: true })
  code: string;

  @Column({ type: 'varchar', name: 'name' })
  name: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => Admin, (admin) => admin.role)
  admins: Admin[];

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  rolePermissions: RolePermission[];
}
