import { EntityNameConst } from 'src/constant/entity-name';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractTimeEntity } from './entity.interface';

@Entity(EntityNameConst.ORDER)
@Index(['idempotencyKey'], { unique: true })
@Index(['userId', 'status', 'createdAt'])
@Index(['symbol', 'status'])
export class Order extends AbstractTimeEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol: string;

  @Column({
    name: 'side',
    type: 'enum',
    enum: OrderSideEnum,
  })
  side: OrderSideEnum;

  @Column({
    name: 'type',
    type: 'enum',
    enum: OrderTypeEnum,
  })
  type: OrderTypeEnum;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 28,
    scale: 8,
  })
  price: string;

  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 28,
    scale: 8,
  })
  quantity: string;

  @Column({
    name: 'filled_quantity',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  filledQuantity: string;

  @Column({
    name: 'locked_currency',
    type: 'enum',
    enum: CurrencyEnum,
  })
  lockedCurrency: CurrencyEnum;

  @Column({
    name: 'locked_amount',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  lockedAmount: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: OrderStatusEnum,
    default: OrderStatusEnum.QUEUED,
  })
  status: OrderStatusEnum;

  @Column({ name: 'reject_reason', type: 'varchar', length: 255, nullable: true })
  rejectReason: string | null;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Admin;
}
