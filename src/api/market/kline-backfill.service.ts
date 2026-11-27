import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ENV } from 'src/config/environment';
import { BinanceRestService } from './binance-rest.service';
import { CandleStoreService } from './candle-store.service';
import {
  KLINE_INTERVALS,
  KLINE_INTERVAL_MS,
  KlineInterval,
} from './market.interface';

/**
 * Điều phối Warm-up khi khởi động app & Vá lỗ hổng (Gap Backfill) sau mỗi lần WS reconnect.
 * - DB rỗng: gọi REST lấy 1000 nến chốt gần nhất (đủ cho EMA(100) hội tụ sai số ~2.5e-9).
 * - DB đã có dữ liệu: nạp RAM từ DB, gọi REST lấy bù các nến thiếu từ latestOpenTime + 1 tới hiện tại.
 */
@Injectable()
export class KlineBackfillService implements OnModuleInit {
  private readonly logger = new Logger(KlineBackfillService.name);

  private isRunning = false;
  private lastWarmupAt: string | null = null;
  private lastGapBackfillAt: string | null = null;
  private totalBackfilledCandles = 0;

  constructor(
    private readonly binanceRest: BinanceRestService,
    private readonly candleStore: CandleStoreService,
  ) {}

  onModuleInit(): void {
    // Chạy nền để không chặn NestJS listen port; lỗi mạng không làm crash app
    void this.warmUpAll().catch((err) => {
      this.logger.warn(
        `Initial kline warm-up encountered an error: ${(err as Error).message}`,
      );
    });
  }

  getConfiguredIntervals(): KlineInterval[] {
    const valid = ENV.BINANCE.KLINE_INTERVALS.filter((i): i is KlineInterval =>
      (KLINE_INTERVALS as string[]).includes(i),
    );
    return valid.length > 0 ? valid : KLINE_INTERVALS;
  }

  /**
   * Warm-up toàn bộ các cặp coin × khung thời gian đã cấu hình.
   */
  async warmUpAll(): Promise<number> {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    let totalSaved = 0;

    try {
      const symbols = ENV.BINANCE.SYMBOLS.map((s) => s.toUpperCase());
      const intervals = this.getConfiguredIntervals();
      const warmupBars = ENV.BINANCE.KLINE_WARMUP_BARS;

      for (const symbol of symbols) {
        for (const interval of intervals) {
          try {
            const count = await this.warmUpSymbolInterval(
              symbol,
              interval,
              warmupBars,
            );
            totalSaved += count;
          } catch (err) {
            this.logger.warn(
              `Warm-up failed for ${symbol} ${interval}: ${(err as Error).message}`,
            );
          }
        }
      }

      this.totalBackfilledCandles += totalSaved;
      this.lastWarmupAt = new Date().toISOString();
      this.logger.log(
        `Kline warm-up completed: ${totalSaved} candles synced across ${symbols.length} symbols × ${intervals.length} intervals (REST weight=${this.binanceRest.getLastUsedWeight1m()}/6000).`,
      );
    } finally {
      this.isRunning = false;
    }

    return totalSaved;
  }

  /**
   * Vá lỗ hổng sau khi Binance WebSocket bị rớt và kết nối lại.
   */
  async backfillGapsAll(): Promise<number> {
    if (this.isRunning) {
      return 0;
    }

    this.isRunning = true;
    let totalPatched = 0;

    try {
      const symbols = ENV.BINANCE.SYMBOLS.map((s) => s.toUpperCase());
      const intervals = this.getConfiguredIntervals();

      for (const symbol of symbols) {
        for (const interval of intervals) {
          try {
            const patched = await this.warmUpSymbolInterval(
              symbol,
              interval,
              ENV.BINANCE.KLINE_WARMUP_BARS,
            );
            totalPatched += patched;
          } catch (err) {
            this.logger.warn(
              `Gap backfill failed for ${symbol} ${interval}: ${(err as Error).message}`,
            );
          }
        }
      }

      this.totalBackfilledCandles += totalPatched;
      this.lastGapBackfillAt = new Date().toISOString();
      if (totalPatched > 0) {
        this.logger.log(
          `Gap backfill after WS reconnect patched ${totalPatched} closed candles.`,
        );
      }
    } finally {
      this.isRunning = false;
    }

    return totalPatched;
  }

  /**
   * Đồng bộ một cặp (symbol, interval):
   * 1. Nạp RAM từ Postgres nếu có.
   * 2. Nếu chưa đủ warmupBars (hoặc DB rỗng) -> lấy `warmupBars` nến chốt gần nhất từ REST.
   * 3. Nếu đã đủ nhưng có khoảng trống tới hiện tại -> gọi REST phân trang lấy bù.
   */
  async warmUpSymbolInterval(
    symbol: string,
    interval: KlineInterval,
    warmupBars = ENV.BINANCE.KLINE_WARMUP_BARS,
  ): Promise<number> {
    const upperSymbol = symbol.toUpperCase();
    const loadedFromDb = await this.candleStore.loadBufferFromDb(
      upperSymbol,
      interval,
      warmupBars,
    );
    const latestOpenTime = await this.candleStore.getLatestOpenTime(
      upperSymbol,
      interval,
    );

    const now = Date.now();
    const stepMs = KLINE_INTERVAL_MS[interval];

    // Case 1: DB rỗng hoặc chưa đủ cửa sổ warm-up (ví dụ mới khởi tạo)
    if (latestOpenTime === null || loadedFromDb < warmupBars) {
      const candles = await this.binanceRest.fetchKlines({
        symbol: upperSymbol,
        interval,
        limit: warmupBars,
        closedOnly: true,
      });
      return await this.candleStore.saveClosedCandlesBatch(candles);
    }

    // Case 2: Đã có đủ nến lịch sử -> chỉ cần kiểm tra lỗ hổng từ latestOpenTime + stepMs tới hiện tại
    const nextExpectedOpenTime = latestOpenTime + stepMs;
    if (now - nextExpectedOpenTime < stepMs) {
      // Đã cập nhật tới cây nến chốt gần nhất, không có lỗ hổng
      return 0;
    }

    const missingCandles = await this.binanceRest.fetchKlinesRange(
      upperSymbol,
      interval,
      nextExpectedOpenTime,
      now,
    );
    return await this.candleStore.saveClosedCandlesBatch(missingCandles);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastWarmupAt: this.lastWarmupAt,
      lastGapBackfillAt: this.lastGapBackfillAt,
      totalBackfilledCandles: this.totalBackfilledCandles,
      configuredIntervals: this.getConfiguredIntervals(),
      warmupBars: ENV.BINANCE.KLINE_WARMUP_BARS,
      binanceRestUsedWeight1m: this.binanceRest.getLastUsedWeight1m(),
    };
  }
}
