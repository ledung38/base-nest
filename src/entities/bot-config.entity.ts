import { EntityNameConst } from 'src/constant/entity-name';
import { BotTypeEnum } from 'src/constant/trading.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Admin } from './admin.entity';
import { AbstractTimeEntity } from './entity.interface';

@Entity(EntityNameConst.BOT_CONFIG)
@Index(['userId', 'symbol', 'botType'])
export class BotConfig extends AbstractTimeEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    name: 'bot_type',
    type: 'enum',
    enum: BotTypeEnum,
  })
  botType: BotTypeEnum;

  @Column({ name: 'symbol', type: 'varchar', length: 20 })
  symbol: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'parameters', type: 'jsonb' })
  parameters: Record<string, any>;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({
    name: 'realized_pnl',
    type: 'numeric',
    precision: 28,
    scale: 8,
    default: '0.00000000',
  })
  realizedPnl: string;

  @Column({ name: 'total_trades_count', type: 'int', default: 0 })
  totalTradesCount: number;

  @Column({ name: 'last_signal', type: 'varchar', length: 20, nullable: true })
  lastSignal: string | null;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Admin;
}
