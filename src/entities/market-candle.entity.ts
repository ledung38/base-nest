import { EntityNameConst } from 'src/constant/entity-name';
import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Lưu trữ nến OHLCV đã chốt (isClosed = true) từ Binance Klines.
 * Khóa chính phức hợp (symbol, interval, open_time) đảm bảo Upsert Idempotent
 * và tối ưu hóa truy vấn theo khoảng thời gian (range scan / reverse index scan).
 */
@Entity(EntityNameConst.MARKET_CANDLE)
export class MarketCandle {
  @PrimaryColumn({ name: 'symbol', type: 'varchar', length: 20 })
  symbol: string;

  @PrimaryColumn({ name: 'interval', type: 'varchar', length: 10 })
  interval: string;

  @PrimaryColumn({ name: 'open_time', type: 'bigint' })
  openTime: string;

  @Column({ name: 'close_time', type: 'bigint' })
  closeTime: string;

  @Column({ name: 'open', type: 'numeric', precision: 28, scale: 8 })
  open: string;

  @Column({ name: 'high', type: 'numeric', precision: 28, scale: 8 })
  high: string;

  @Column({ name: 'low', type: 'numeric', precision: 28, scale: 8 })
  low: string;

  @Column({ name: 'close', type: 'numeric', precision: 28, scale: 8 })
  close: string;

  @Column({ name: 'volume', type: 'numeric', precision: 28, scale: 8 })
  volume: string;

  @Column({ name: 'trades_count', type: 'int', default: 0 })
  tradesCount: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
