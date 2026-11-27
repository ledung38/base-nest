import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { MarketCandle } from 'src/entities/market-candle.entity';
import { Repository } from 'typeorm';
import { Candlestick, KlineInterval } from './market.interface';

/**
 * Kho lưu trữ nến chốt (Closed Klines) 2 tầng:
 * - Tầng 1 (RAM Ring Buffer): 1000 nến chốt gần nhất mỗi (symbol, interval), đọc O(1) ~5MB RAM.
 * - Tầng 2 (PostgreSQL): Nguồn sự thật bền vững qua restart, hỗ trợ backfill & truy vấn lịch sử.
 */
@Injectable()
export class CandleStoreService {
  private readonly logger = new Logger(CandleStoreService.name);
  readonly MAX_BUFFER_SIZE = 1000;
  private readonly DB_UPSERT_CHUNK_SIZE = 500;

  // key = `${symbol}_${interval}`, mảng luôn sắp xếp tăng dần theo openTime, chỉ chứa isClosed=true
  private readonly ringBuffers = new Map<string, Candlestick[]>();

  constructor(
    @InjectRepository(MarketCandle)
    private readonly candleRepo: Repository<MarketCandle>,
  ) {}

  private buildKey(symbol: string, interval: string): string {
    return `${symbol.toUpperCase()}_${interval}`;
  }

  private normalizeDecimal(value: string): string {
    return new BigNumber(value).toFixed(8);
  }

  private toEntity(candle: Candlestick): Partial<MarketCandle> {
    return {
      symbol: candle.symbol.toUpperCase(),
      interval: candle.interval,
      openTime: String(candle.openTime),
      closeTime: String(candle.closeTime),
      open: this.normalizeDecimal(candle.open),
      high: this.normalizeDecimal(candle.high),
      low: this.normalizeDecimal(candle.low),
      close: this.normalizeDecimal(candle.close),
      volume: this.normalizeDecimal(candle.volume),
      tradesCount: candle.tradesCount ?? 0,
    };
  }

  private fromEntity(row: MarketCandle): Candlestick {
    return {
      symbol: row.symbol,
      interval: row.interval as KlineInterval,
      openTime: Number(row.openTime),
      closeTime: Number(row.closeTime),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      tradesCount: row.tradesCount,
      isClosed: true,
    };
  }

  /**
   * Đưa 1 hoặc nhiều nến chốt vào RAM ring buffer (dedupe theo openTime, giữ thứ tự tăng dần, cắt tối đa 1000).
   * Trả về số lượng nến MỚI thực sự được thêm vào buffer.
   */
  private upsertBuffer(
    symbol: string,
    interval: string,
    candles: Candlestick[],
  ): number {
    const key = this.buildKey(symbol, interval);
    const existing = this.ringBuffers.get(key) || [];
    const byOpenTime = new Map<number, Candlestick>();

    for (const c of existing) {
      byOpenTime.set(c.openTime, c);
    }

    let insertedCount = 0;
    for (const c of candles) {
      if (!byOpenTime.has(c.openTime)) {
        insertedCount += 1;
      }
      byOpenTime.set(c.openTime, {
        ...c,
        symbol: symbol.toUpperCase(),
        open: this.normalizeDecimal(c.open),
        high: this.normalizeDecimal(c.high),
        low: this.normalizeDecimal(c.low),
        close: this.normalizeDecimal(c.close),
        volume: this.normalizeDecimal(c.volume),
        isClosed: true,
      });
    }

    const sorted = Array.from(byOpenTime.values()).sort(
      (a, b) => a.openTime - b.openTime,
    );
    const trimmed =
      sorted.length > this.MAX_BUFFER_SIZE
        ? sorted.slice(-this.MAX_BUFFER_SIZE)
        : sorted;

    this.ringBuffers.set(key, trimmed);
    return insertedCount;
  }

  /**
   * Lưu 1 cây nến đã chốt vào cả RAM và PostgreSQL (idempotent upsert).
   * Trả về true nếu là nến mới (chưa có trong RAM buffer), false nếu trùng openTime hoặc chưa chốt.
   */
  async saveClosedCandle(candle: Candlestick): Promise<boolean> {
    if (!candle.isClosed) {
      return false;
    }

    const inserted = this.upsertBuffer(candle.symbol, candle.interval, [candle]);

    try {
      await this.upsertToDb([candle]);
    } catch (err) {
      this.logger.error(
        `Failed to persist closed candle ${candle.symbol} ${candle.interval} @${candle.openTime}: ${(err as Error).message}`,
      );
    }

    return inserted > 0;
  }

  /**
   * Lưu lô nhiều cây nến đã chốt (dùng cho warm-up & gap backfill).
   */
  async saveClosedCandlesBatch(candles: Candlestick[]): Promise<number> {
    const closedOnly = candles.filter((c) => c.isClosed);
    if (closedOnly.length === 0) {
      return 0;
    }

    // Nhóm theo (symbol, interval) để cập nhật từng RAM ring buffer
    const grouped = new Map<string, Candlestick[]>();
    for (const c of closedOnly) {
      const key = this.buildKey(c.symbol, c.interval);
      const list = grouped.get(key) || [];
      list.push(c);
      grouped.set(key, list);
    }

    for (const list of grouped.values()) {
      this.upsertBuffer(list[0].symbol, list[0].interval, list);
    }

    try {
      for (let i = 0; i < closedOnly.length; i += this.DB_UPSERT_CHUNK_SIZE) {
        const chunk = closedOnly.slice(i, i + this.DB_UPSERT_CHUNK_SIZE);
        await this.upsertToDb(chunk);
      }
    } catch (err) {
      this.logger.error(
        `Failed to batch upsert ${closedOnly.length} candles: ${(err as Error).message}`,
      );
    }

    return closedOnly.length;
  }

  private async upsertToDb(candles: Candlestick[]): Promise<void> {
    const entities = candles.map((c) => this.toEntity(c));
    await this.candleRepo
      .createQueryBuilder()
      .insert()
      .into(MarketCandle)
      .values(entities)
      .orUpdate(
        [
          'close_time',
          'open',
          'high',
          'low',
          'close',
          'volume',
          'trades_count',
          'updated_at',
        ],
        ['symbol', 'interval', 'open_time'],
      )
      .execute();
  }

  /**
   * Nạp sẵn từ PostgreSQL vào RAM ring buffer (khi app restart).
   */
  async loadBufferFromDb(
    symbol: string,
    interval: KlineInterval,
    limit = this.MAX_BUFFER_SIZE,
  ): Promise<number> {
    const take = Math.min(Math.max(limit, 1), this.MAX_BUFFER_SIZE);
    const rows = await this.candleRepo
      .createQueryBuilder('c')
      .where('c.symbol = :symbol AND c.interval = :interval', {
        symbol: symbol.toUpperCase(),
        interval,
      })
      .orderBy('c.open_time', 'DESC')
      .take(take)
      .getMany();

    if (rows.length === 0) {
      return 0;
    }

    const candles = rows.reverse().map((r) => this.fromEntity(r));
    this.upsertBuffer(symbol, interval, candles);
    return candles.length;
  }

  /**
   * Lấy openTime mới nhất hiện có (ưu tiên RAM, fallback Postgres).
   */
  async getLatestOpenTime(
    symbol: string,
    interval: KlineInterval,
  ): Promise<number | null> {
    const key = this.buildKey(symbol, interval);
    const buf = this.ringBuffers.get(key);
    if (buf && buf.length > 0) {
      return buf[buf.length - 1].openTime;
    }

    const result = await this.candleRepo
      .createQueryBuilder('c')
      .select('MAX(c.open_time)', 'maxOpenTime')
      .where('c.symbol = :symbol AND c.interval = :interval', {
        symbol: symbol.toUpperCase(),
        interval,
      })
      .getRawOne<{ maxOpenTime: string | null }>();

    return result?.maxOpenTime ? Number(result.maxOpenTime) : null;
  }

  /**
   * Đọc nến chốt (ưu tiên RAM nếu đủ, fallback Postgres khi truy vấn sâu hoặc có endTime cũ).
   * Luôn trả về mảng tăng dần theo openTime và chỉ chứa nến isClosed = true.
   */
  async getClosedCandles(
    symbol: string,
    interval: KlineInterval,
    limit = 1000,
    endTime?: number,
  ): Promise<Candlestick[]> {
    const upperSymbol = symbol.toUpperCase();
    const take = Math.min(Math.max(limit, 1), this.MAX_BUFFER_SIZE);
    const key = this.buildKey(upperSymbol, interval);
    const buf = this.ringBuffers.get(key) || [];

    // Fast path: phục vụ trực tiếp từ RAM nếu không yêu cầu endTime cũ hơn cửa sổ RAM
    if (!endTime && buf.length >= take) {
      return buf.slice(-take);
    }

    if (endTime && buf.length > 0 && endTime >= buf[0].openTime) {
      const filtered = buf.filter((c) => c.openTime <= endTime);
      if (filtered.length >= take) {
        return filtered.slice(-take);
      }
    }

    // Fallback: đọc từ PostgreSQL
    try {
      const qb = this.candleRepo
        .createQueryBuilder('c')
        .where('c.symbol = :symbol AND c.interval = :interval', {
          symbol: upperSymbol,
          interval,
        });

      if (endTime !== undefined) {
        qb.andWhere('c.open_time <= :endTime', { endTime: String(endTime) });
      }

      const rows = await qb
        .orderBy('c.open_time', 'DESC')
        .take(take)
        .getMany();

      if (rows.length > 0) {
        return rows.reverse().map((r) => this.fromEntity(r));
      }
    } catch (err) {
      this.logger.warn(
        `DB query fallback failed for ${upperSymbol} ${interval}, serving RAM buffer: ${(err as Error).message}`,
      );
    }

    // Nếu DB chưa có hoặc lỗi, trả về phần đang có trong RAM
    const fallback = endTime
      ? buf.filter((c) => c.openTime <= endTime)
      : buf;
    return fallback.slice(-take);
  }

  /**
   * Thống kê số lượng nến chốt hiện có trong RAM buffer cho pipeline-status.
   */
  getStats(): Record<string, { count: number; latestOpenTime: number | null }> {
    const stats: Record<
      string,
      { count: number; latestOpenTime: number | null }
    > = {};
    for (const [key, list] of this.ringBuffers.entries()) {
      stats[key] = {
        count: list.length,
        latestOpenTime:
          list.length > 0 ? list[list.length - 1].openTime : null,
      };
    }
    return stats;
  }
}
