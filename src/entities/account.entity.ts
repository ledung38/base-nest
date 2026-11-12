import { EntityNameConst } from 'src/constant/entity-name';
import { CurrencyEnum } from 'src/constant/trading.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractTimeEntity } from './entity.interface';
import { LedgerEntry } from './ledger-entry.entity';

@Entity(EntityNameConst.ACCOUNT)
@Index(['userId', 'currency'], { unique: true })
export class Account extends AbstractTimeEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    name: 'currency',
    type: 'enum',
    enum: CurrencyEnum,
    default: CurrencyEnum.USDT,
  })
  currency: CurrencyEnum;

  @Column({
    name: 'available_balance',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  availableBalance: string;

  @Column({
    name: 'locked_balance',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  lockedBalance: string;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Admin;

  @OneToMany(() => LedgerEntry, (entry) => entry.account)
  ledgerEntries: LedgerEntry[];
}

