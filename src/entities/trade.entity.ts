import { EntityNameConst } from 'src/constant/entity-name';
import { OrderSideEnum } from 'src/constant/trading.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractTimeEntity } from './entity.interface';
import { Order } from './order.entity';

@Entity(EntityNameConst.TRADE)
@Index(['symbol', 'createdAt'])
@Index(['buyOrderId'])
@Index(['sellOrderId'])
@Index(['buyerId', 'createdAt'])
@Index(['sellerId', 'createdAt'])
export class Trade extends AbstractTimeEntity {
  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol: string;

  @Column({ name: 'buy_order_id', type: 'int', nullable: true })
  buyOrderId: number | null;

  @Column({ name: 'sell_order_id', type: 'int', nullable: true })
  sellOrderId: number | null;

  @Column({ name: 'buyer_id', type: 'int', nullable: true })
  buyerId: number | null;

  @Column({ name: 'seller_id', type: 'int', nullable: true })
  sellerId: number | null;

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
    name: 'quote_amount',
    type: 'numeric',
    precision: 28,
    scale: 8,
  })
  quoteAmount: string;

  @Column({
    name: 'taker_side',
    type: 'enum',
    enum: OrderSideEnum,
  })
  takerSide: OrderSideEnum;

  @Column({
    name: 'buyer_fee',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  buyerFee: string;

  @Column({
    name: 'seller_fee',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  sellerFee: string;

  @Column({
    name: 'is_simulated_liquidity',
    type: 'boolean',
    default: false,
  })
  isSimulatedLiquidity: boolean;

  // Relations
  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'buy_order_id' })
  buyOrder: Order | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'sell_order_id' })
  sellOrder: Order | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'buyer_id' })
  buyer: Admin | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'seller_id' })
  seller: Admin | null;
}
