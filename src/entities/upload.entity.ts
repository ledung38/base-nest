import { EntityNameConst } from 'src/constant/entity-name';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractCreatedEntity } from './entity.interface';

@Entity(EntityNameConst.UPLOAD)
export class Upload extends AbstractCreatedEntity {
  @Column({ primary: true, name: 'path', type: 'varchar', unique: true })
  path: string;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  isActive: boolean;

  @Column({ type: 'int', name: 'creator_id', nullable: true })
  creatorId: number;

  @ManyToOne(() => Admin, (admin) => admin.uploads, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'creator_id' })
  creator: Admin;
}
