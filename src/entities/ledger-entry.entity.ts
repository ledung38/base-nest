import { EntityNameConst } from 'src/constant/entity-name';
import {
  BalanceTypeEnum,
  LedgerDirectionEnum,
  LedgerReferenceTypeEnum,
} from 'src/constant/trading.enum';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Account } from './account.entity';
import { AbstractCreatedEntity } from './entity.interface';

@Entity(EntityNameConst.LEDGER_ENTRY)
@Index(['accountId', 'createdAt'])
@Index(['transactionId'])
@Index(['referenceId'])
export class LedgerEntry extends AbstractCreatedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'account_id', type: 'int' })
  accountId: number;

  @Column({ name: 'transaction_id', type: 'varchar', length: 64 })
  transactionId: string;

  @Column({ name: 'reference_id', type: 'varchar', length: 64 })
  referenceId: string;

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: LedgerReferenceTypeEnum,
  })
  referenceType: LedgerReferenceTypeEnum;

  @Column({
    name: 'balance_type',
    type: 'enum',
    enum: BalanceTypeEnum,
  })
  balanceType: BalanceTypeEnum;

  @Column({
    name: 'direction',
    type: 'enum',
    enum: LedgerDirectionEnum,
  })
  direction: LedgerDirectionEnum;

  @Column({
    name: 'amount',
    type: 'numeric',
    precision: 28,
    scale: 8,
  })
  amount: string;

  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 28,
    scale: 8,
  })
  balanceAfter: string;

  @Column({ name: 'note', type: 'varchar', length: 255, nullable: true })
  note: string;

  @ManyToOne(() => Account, (account) => account.ledgerEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'account_id' })
  account: Account;
}

