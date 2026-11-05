import { EntityNameConst } from 'src/constant/entity-name';
import { Gender } from 'src/constant/enum-common';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Tree, TreeChildren, TreeParent } from 'typeorm';
import { AbstractTimeEntity } from './entity.interface';
import { Role } from './role.entity';
import { Upload } from './upload.entity';

@Entity(EntityNameConst.ADMIN)
@Tree('closure-table', {
  closureTableName: EntityNameConst.ADMIN,
  ancestorColumnName: (column) => 'ancestor_' + column.propertyName,
  descendantColumnName: (column) => 'descendant_' + column.propertyName,
})
export class Admin extends AbstractTimeEntity {
  @Column({ name: 'username', type: 'varchar', unique: true })
  username: string;

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email: string;

  @Column({ name: 'password', type: 'varchar' })
  password: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({
    name: 'phone_number',
    type: 'varchar',
    nullable: true,
  })
  phoneNumber: string;

  @Column({ name: 'address', type: 'varchar', nullable: true })
  address: string;

  @Column({
    name: 'gender',
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  gender: Gender;

  @Column({ type: 'boolean', name: 'is_super_admin', default: false })
  isSupperAdmin: boolean;

  @Column({ type: 'int', name: 'role_id', nullable: true })
  roleId: number;

  @Column({ name: 'parent_id', nullable: true })
  parentId: number;

  @TreeParent()
  @JoinColumn({ name: 'parent_id' })
  parent: Admin;

  @TreeChildren({ cascade: true })
  children: Admin[];

  @ManyToOne(() => Role, (role) => role.admins, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @OneToMany(() => Upload, (upload) => upload.creator)
  uploads: Upload[];
}
