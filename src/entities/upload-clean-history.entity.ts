import { EntityNameConst } from 'src/constant/entity-name';
import { Column, Entity } from 'typeorm';
import { AbstractIdEntity } from './entity.interface';

export type UploadCleanHistoryType = {
  totalSuccess: number;
  totalError: number;
};

@Entity(EntityNameConst.UPLOAD_CLEAN_HISTORY)
export class UploadCleanHistory extends AbstractIdEntity {
  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'int', name: 'total_success' })
  totalSuccess: number;

  @Column({ type: 'int', name: 'total_error' })
  totalError: number;
}
