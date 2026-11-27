import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { KLINE_INTERVALS, KlineInterval } from 'src/api/market/market.interface';
import { OrderService } from 'src/api/order/order.service';
import {
  BotTypeEnum,
  OrderSideEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { Repository } from 'typeorm';
import {
  AlphaSignalParameters,
  BotRuntimeState,
  SignalPipelineStatus,
  TradingSignalPayload,
} from './bot.interface';

const DEFAULT_MAX_STALENESS_MS: Record<KlineInterval, number> = {
  '1m': 15_000,
  '5m': 30_000,
  '15m': 60_000,
  '1h': 120_000,
  '1d': 300_000,
};

/**
 * Consumer tiếp nhận tín hiệu Alpha từ Python quant-worker qua RabbitMQ (`trading.signals`).
 * - Idempotency xác định trước theo (botId, signalId) <= 64 ký tự -> không bao giờ vào trùng lệnh khi retry/replay.
 * - Chặn tín hiệu cũ (staleness guard) theo `now - candleCloseTime`.
 * - Python chỉ báo hướng (+1/-1); khối lượng, khóa tiền, rủi ro & sổ cái kép do NestJS đảm nhiệm.
 */
@Injectable()
export class SignalConsumerService {
  private readonly logger = new Logger(SignalConsumerService.name);
  private readonly activeBots = new Map<number, BotRuntimeState>();

  private totalSignalsReceived = 0;
  private totalOrdersTriggered = 0;
  private totalSkippedStale = 0;
  private totalSkippedDuplicate = 0;
  private totalSkippedNoMatch = 0;
  private totalOrderErrors = 0;
  private lastSignalId: string | null = null;
  private lastSignalLatencyMs: number | null = null;
  private lastQueueLagMs: number | null = null;

  constructor(
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
    private readonly orderService: OrderService,
  ) {}

  /**
   * Đăng ký 1 Alpha Signal Bot vào danh sách đang chạy.
   */
  async startBot(bot: BotConfig): Promise<void> {
    const params = bot.parameters as unknown as AlphaSignalParameters;
    if (!params?.strategyCode || !params?.candleInterval || !params?.orderQuantity) {
      throw new Error(
        `Alpha Signal Bot #${bot.id} thiếu tham số bắt buộc (strategyCode, candleInterval, orderQuantity)`,
      );
    }

    const interval = params.candleInterval;
    const maxStalenessMs =
      params.maxStalenessMs && params.maxStalenessMs > 0
        ? params.maxStalenessMs
        : DEFAULT_MAX_STALENESS_MS[interval] || 30_000;

    this.activeBots.set(bot.id, {
      botId: bot.id,
      userId: bot.userId,
      symbol: bot.symbol.toUpperCase(),
      botType: BotTypeEnum.ALPHA_SIGNAL,
      isActive: true,
      strategyCode: params.strategyCode.trim(),
      candleInterval: interval,
      orderQuantity: String(params.orderQuantity),
      maxStalenessMs,
      lastSignal: (bot.lastSignal as 'BUY' | 'SELL' | 'NEUTRAL') || 'NEUTRAL',
    });

    this.logger.log(
      `Alpha Signal Bot #${bot.id} active: strategy=[${params.strategyCode}] symbol=[${bot.symbol}] interval=[${interval}] qty=[${params.orderQuantity}]`,
    );
  }

  /**
   * Hủy đăng ký 1 Alpha Signal Bot khỏi danh sách lắng nghe tín hiệu.
   */
  async stopBot(botId: number): Promise<void> {
    this.activeBots.delete(botId);
    this.logger.log(`Alpha Signal Bot #${botId} stopped cleanly.`);
  }

  /**
   * Tạo Idempotency-Key xác định trước (<= 64 ký tự) từ (botId, signalId).
   */
  buildIdempotencyKey(botId: number, signalId: string): string {
    const digest = createHash('sha256')
      .update(signalId)
      .digest('hex')
      .slice(0, 24);
    return `sig-${botId}-${digest}`;
  }

  private isValidSignal(payload: unknown): payload is TradingSignalPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return (
      typeof p.signalId === 'string' &&
      p.signalId.trim().length > 0 &&
      typeof p.strategyCode === 'string' &&
      p.strategyCode.trim().length > 0 &&
      typeof p.symbol === 'string' &&
      p.symbol.trim().length > 0 &&
      typeof p.interval === 'string' &&
      (KLINE_INTERVALS as string[]).includes(p.interval) &&
      typeof p.candleOpenTime === 'number' &&
      typeof p.candleCloseTime === 'number' &&
      (p.action === 1 || p.action === -1 || p.action === 0)
    );
  }

  /**
   * Xử lý 1 tín hiệu nhận được từ RabbitMQ queue `trading.signals`.
   * Trả về 'ACK' nếu hợp lệ (kể cả khi bỏ qua do stale/duplicate/no-match),
   * trả về 'NACK' để đẩy sang DLQ nếu payload sai schema.
   */
  async handleSignal(
    rawPayload: unknown,
    now = Date.now(),
  ): Promise<'ACK' | 'NACK'> {
    if (!this.isValidSignal(rawPayload)) {
      this.logger.warn(
        `Malformed trading signal payload, routing to DLQ: ${JSON.stringify(rawPayload)}`,
      );
      return 'NACK';
    }

    const signal = rawPayload;
    this.totalSignalsReceived += 1;
    this.lastSignalId = signal.signalId;

    if (signal.action === 0) {
      return 'ACK';
    }

    const symbol = signal.symbol.toUpperCase();
    const signalAgeMs = now - signal.candleCloseTime;
    const queueLagMs =
      typeof signal.generatedAt === 'number' ? now - signal.generatedAt : null;

    this.lastSignalLatencyMs = signalAgeMs;
    this.lastQueueLagMs = queueLagMs;

    const side =
      signal.action === 1 ? OrderSideEnum.BUY : OrderSideEnum.SELL;

    const matchedBots: BotRuntimeState[] = [];
    for (const runtime of this.activeBots.values()) {
      if (
        runtime.isActive &&
        runtime.symbol === symbol &&
        runtime.strategyCode === signal.strategyCode &&
        runtime.candleInterval === signal.interval
      ) {
        matchedBots.push(runtime);
      }
    }

    if (matchedBots.length === 0) {
      this.totalSkippedNoMatch += 1;
      return 'ACK';
    }

    for (const runtime of matchedBots) {
      const maxStaleness =
        runtime.maxStalenessMs ?? DEFAULT_MAX_STALENESS_MS[signal.interval];

      // 1. Chặn tín hiệu cũ (tránh xả lệnh sau khi hệ thống sập rồi khởi động lại)
      if (signalAgeMs > maxStaleness) {
        this.totalSkippedStale += 1;
        this.logger.warn(
          `[SignalStale] Bot #${runtime.botId} ignored stale signal [${signal.signalId}] (age=${signalAgeMs}ms > max=${maxStaleness}ms)`,
        );
        continue;
      }

      // 2. Chặn lặp hướng liên tiếp (tránh mua nhồi khi tín hiệu +1 xuất hiện liên tục)
      if (runtime.lastSignal === side) {
        this.totalSkippedDuplicate += 1;
        continue;
      }

      const idempotencyKey = this.buildIdempotencyKey(
        runtime.botId,
        signal.signalId,
      );

      try {
        // Bắt buộc đúng thứ tự tham số: (userId, idempotencyKey, dto)
        const result = await this.orderService.createOrder(
          runtime.userId,
          idempotencyKey,
          {
            symbol,
            side,
            type: OrderTypeEnum.MARKET,
            quantity: runtime.orderQuantity!,
          },
        );

        if (result.idempotentReplay) {
          this.totalSkippedDuplicate += 1;
          this.logger.debug(
            `[SignalReplay] Bot #${runtime.botId} idempotent replay for [${signal.signalId}]`,
          );
          continue;
        }

        runtime.lastSignal = side;
        this.totalOrdersTriggered += 1;

        this.logger.log(
          `[SignalExecuted] Bot #${runtime.botId} ${side} ${runtime.orderQuantity} ${symbol} via [${signal.strategyCode}/${signal.interval}] (e2eLatency=${signalAgeMs}ms, queueLag=${queueLagMs ?? 'n/a'}ms)`,
        );

        await this.updateBotStats(runtime.botId, side);
      } catch (err) {
        // Lỗi nghiệp vụ của 1 user (vd thiếu số dư) chỉ bỏ qua bot đó, không đẩy cả message sang DLQ
        this.totalOrderErrors += 1;
        this.logger.error(
          `[SignalOrderError] Bot #${runtime.botId} failed to execute ${side} for [${signal.signalId}]: ${(err as Error).message}`,
        );
      }
    }

    return 'ACK';
  }

  private async updateBotStats(
    botId: number,
    side: OrderSideEnum,
  ): Promise<void> {
    const bot = await this.botConfigRepo.findOne({ where: { id: botId } });
    if (!bot) return;

    bot.lastSignal = side;
    bot.lastRunAt = new Date();
    bot.totalTradesCount += 1;
    await this.botConfigRepo.save(bot);
  }

  getActiveBotsCount(): number {
    return this.activeBots.size;
  }

  getStatus(): SignalPipelineStatus {
    return {
      activeAlphaBots: this.activeBots.size,
      totalSignalsReceived: this.totalSignalsReceived,
      totalOrdersTriggered: this.totalOrdersTriggered,
      totalSkippedStale: this.totalSkippedStale,
      totalSkippedDuplicate: this.totalSkippedDuplicate,
      totalSkippedNoMatch: this.totalSkippedNoMatch,
      totalOrderErrors: this.totalOrderErrors,
      lastSignalId: this.lastSignalId,
      lastSignalLatencyMs: this.lastSignalLatencyMs,
      lastQueueLagMs: this.lastQueueLagMs,
    };
  }
}
