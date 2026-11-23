import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import { Candlestick, CandleInterval } from 'src/api/market/market.interface';
import { OrderService } from 'src/api/order/order.service';
import { OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { Repository } from 'typeorm';
import {
  BotRuntimeState,
  EmaCrossParameters,
  IndicatorSnapshot,
} from '../bot.interface';
import { EmaCalculator } from '../indicators/ema';

@Injectable()
export class EmaCrossWorker {
  private readonly logger = new Logger(EmaCrossWorker.name);
  private readonly activeBots = new Map<number, BotRuntimeState>();

  constructor(
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
    private readonly orderService: OrderService,
    private readonly candleAggregator: CandleAggregatorService,
  ) {
    // Đăng ký lắng nghe sự kiện đóng nến từ CandleAggregator
    this.candleAggregator.onCandle((candle, isClosed) => {
      if (isClosed) {
        this.evaluateOnCandleClose(candle);
      }
    });
  }

  /**
   * Kích hoạt EMA Cross Bot
   */
  async startBot(bot: BotConfig): Promise<void> {
    const params = bot.parameters as unknown as EmaCrossParameters;
    const shortPeriod = Number(params.shortPeriod || 9);
    const longPeriod = Number(params.longPeriod || 21);
    const interval = (params.candleInterval || '1m') as CandleInterval;

    // Lấy lịch sử nến hiện tại để tính toán EMA ban đầu
    const candles = this.candleAggregator.getCandles(bot.symbol, interval, 50);
    const prices = candles.map((c) => c.close);

    let prevShortEma: string | undefined;
    let prevLongEma: string | undefined;

    if (prices.length >= longPeriod) {
      prevShortEma = EmaCalculator.calculate(prices, shortPeriod) || undefined;
      prevLongEma = EmaCalculator.calculate(prices, longPeriod) || undefined;
    }

    this.activeBots.set(bot.id, {
      botId: bot.id,
      userId: bot.userId,
      symbol: bot.symbol,
      botType: bot.botType,
      isActive: true,
      prevShortEma,
      prevLongEma,
      lastSignal: (bot.lastSignal as any) || 'NEUTRAL',
    });

    this.logger.log(
      `EMA Cross Bot #${bot.id} started for ${bot.symbol} (EMA ${shortPeriod}/${longPeriod}, interval: ${interval})`,
    );
  }

  /**
   * Dừng EMA Cross Bot
   */
  async stopBot(botId: number): Promise<void> {
    this.activeBots.delete(botId);
    this.logger.log(`EMA Cross Bot #${botId} stopped cleanly.`);
  }

  /**
   * Đánh giá tín hiệu giao cắt khi cây nến đóng (Tránh tín hiệu giả trong phiên)
   */
  private async evaluateOnCandleClose(candle: Candlestick): Promise<void> {
    for (const [botId, runtime] of this.activeBots.entries()) {
      if (runtime.symbol !== candle.symbol) continue;

      const bot = await this.botConfigRepo.findOne({ where: { id: botId } });
      if (!bot || !bot.isActive) continue;

      const params = bot.parameters as unknown as EmaCrossParameters;
      const shortPeriod = Number(params.shortPeriod || 9);
      const longPeriod = Number(params.longPeriod || 21);
      const interval = (params.candleInterval || '1m') as CandleInterval;

      if (candle.interval !== interval) continue;

      // Lấy danh sách nến đóng gần đây
      const candles = this.candleAggregator.getCandles(candle.symbol, interval, 50);
      const prices = candles.map((c) => c.close);

      if (prices.length < longPeriod) continue;

      const currShortEma = EmaCalculator.calculate(prices, shortPeriod);
      const currLongEma = EmaCalculator.calculate(prices, longPeriod);

      if (!currShortEma || !currLongEma) continue;

      // Nếu đã có giá trị EMA trước đó -> So sánh tìm điểm giao cắt
      if (runtime.prevShortEma && runtime.prevLongEma) {
        const signal = EmaCalculator.detectCross(
          runtime.prevShortEma,
          runtime.prevLongEma,
          currShortEma,
          currLongEma,
        );

        // 1. Tín hiệu GOLDEN_CROSS (EMA ngắn cắt lên EMA dài -> MUA)
        if (signal === 'GOLDEN_CROSS' && runtime.lastSignal !== 'BUY') {
          this.logger.log(`[EMA Cross] GOLDEN_CROSS detected for Bot #${botId} (${bot.symbol}) -> Triggering MARKET BUY`);
          try {
            const idempotencyKey = `ema-${botId}-buy-${Date.now()}`;
            await this.orderService.createOrder(
              runtime.userId,
              idempotencyKey,
              {
                symbol: runtime.symbol,
                side: OrderSideEnum.BUY,
                type: OrderTypeEnum.MARKET,
                quantity: params.orderQuantity,
              },
            );

            runtime.lastSignal = 'BUY';
            await this.updateBotSignal(botId, 'BUY');
          } catch (err) {
            this.logger.error(`Failed to place EMA BUY order for Bot #${botId}: ${(err as Error).message}`);
          }
        }

        // 2. Tín hiệu DEATH_CROSS (EMA ngắn cắt xuống EMA dài -> BÁN)
        if (signal === 'DEATH_CROSS' && runtime.lastSignal === 'BUY') {
          this.logger.log(`[EMA Cross] DEATH_CROSS detected for Bot #${botId} (${bot.symbol}) -> Triggering MARKET SELL`);
          try {
            const idempotencyKey = `ema-${botId}-sell-${Date.now()}`;
            await this.orderService.createOrder(
              runtime.userId,
              idempotencyKey,
              {
                symbol: runtime.symbol,
                side: OrderSideEnum.SELL,
                type: OrderTypeEnum.MARKET,
                quantity: params.orderQuantity,
              },
            );

            runtime.lastSignal = 'SELL';
            await this.updateBotSignal(botId, 'SELL');
          } catch (err) {
            this.logger.error(`Failed to place EMA SELL order for Bot #${botId}: ${(err as Error).message}`);
          }
        }
      }

      // Cập nhật trạng thái EMA cho nến kế tiếp
      runtime.prevShortEma = currShortEma;
      runtime.prevLongEma = currLongEma;
    }
  }

  private async updateBotSignal(botId: number, signal: string): Promise<void> {
    const bot = await this.botConfigRepo.findOne({ where: { id: botId } });
    if (!bot) return;

    bot.lastSignal = signal;
    bot.lastRunAt = new Date();
    bot.totalTradesCount += 1;
    await this.botConfigRepo.save(bot);
  }

  /**
   * Trích xuất thông số chỉ báo kỹ thuật hiện tại cho Bot
   */
  getIndicatorSnapshot(bot: BotConfig): IndicatorSnapshot {
    const params = bot.parameters as unknown as EmaCrossParameters;
    const shortPeriod = Number(params.shortPeriod || 9);
    const longPeriod = Number(params.longPeriod || 21);
    const interval = (params.candleInterval || '1m') as CandleInterval;

    const candles = this.candleAggregator.getCandles(bot.symbol, interval, 50);
    const prices = candles.map((c) => c.close);
    const latestTick = this.candleAggregator.getLatestPrice(bot.symbol);

    const shortEma = EmaCalculator.calculate(prices, shortPeriod);
    const longEma = EmaCalculator.calculate(prices, longPeriod);

    let signal: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NEUTRAL' = 'NEUTRAL';
    const runtime = this.activeBots.get(bot.id);
    if (runtime?.prevShortEma && runtime?.prevLongEma && shortEma && longEma) {
      signal = EmaCalculator.detectCross(
        runtime.prevShortEma,
        runtime.prevLongEma,
        shortEma,
        longEma,
      );
    }

    return {
      symbol: bot.symbol,
      interval,
      candleCount: candles.length,
      currentPrice: latestTick ? latestTick.price : (prices[prices.length - 1] || '0.00'),
      shortEma,
      longEma,
      signal,
    };
  }

  getActiveBotsCount(): number {
    return this.activeBots.size;
  }
}
