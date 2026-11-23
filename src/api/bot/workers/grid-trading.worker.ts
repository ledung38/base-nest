import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import { TradeDomainEvent } from 'src/api/order/order.interface';
import { OrderService } from 'src/api/order/order.service';
import { OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { Repository } from 'typeorm';
import {
  BotRuntimeState,
  GridLevelState,
  GridParameters,
} from '../bot.interface';

@Injectable()
export class GridTradingWorker {
  private readonly logger = new Logger(GridTradingWorker.name);
  private readonly activeBots = new Map<number, BotRuntimeState>();

  constructor(
    @InjectRepository(BotConfig)
    private readonly botConfigRepo: Repository<BotConfig>,
    private readonly orderService: OrderService,
    private readonly candleAggregator: CandleAggregatorService,
  ) {}

  /**
   * Khởi chạy Grid Bot: Tính toán các mức lưới và rải các lệnh BUY/SELL ban đầu
   */
  async startBot(bot: BotConfig): Promise<void> {
    const params = bot.parameters as unknown as GridParameters;
    const lowerBN = new BigNumber(params.lowerPrice);
    const upperBN = new BigNumber(params.upperPrice);
    const levels = Number(params.gridLevels);
    const qtyBN = new BigNumber(params.quantityPerGrid);

    if (levels < 2 || upperBN.isLessThanOrEqualTo(lowerBN) || qtyBN.isLessThanOrEqualTo(0)) {
      throw new Error('Thông số Grid Bot không hợp lệ (cần upper > lower và gridLevels >= 2)');
    }

    // Khoảng cách giữa các tầng lưới: step = (upper - lower) / (levels - 1)
    const stepBN = upperBN.minus(lowerBN).dividedBy(levels - 1);

    const latestTick = this.candleAggregator.getLatestPrice(bot.symbol);
    const currentPriceBN = latestTick
      ? new BigNumber(latestTick.price)
      : lowerBN.plus(upperBN).dividedBy(2); // Fallback mức giữa

    const gridLevels: GridLevelState[] = [];

    // Tính toán từng mức giá trong lưới
    for (let i = 0; i < levels; i++) {
      const price = lowerBN.plus(stepBN.multipliedBy(i)).toFixed(2);
      const priceBN = new BigNumber(price);

      const levelState: GridLevelState = {
        index: i,
        price,
        status: 'IDLE',
      };

      // Nếu mức giá nhỏ hơn giá thị trường hiện tại -> Đặt lệnh BUY LIMIT
      if (priceBN.isLessThan(currentPriceBN)) {
        try {
          const idempotencyKey = `grid-${bot.id}-buy-${i}-${Date.now()}`;
          const res = await this.orderService.createOrder(
            bot.userId,
            idempotencyKey,
            {
              symbol: bot.symbol,
              side: OrderSideEnum.BUY,
              type: OrderTypeEnum.LIMIT,
              price,
              quantity: params.quantityPerGrid,
            },
          );

          levelState.status = 'BUY_PLACED';
          levelState.activeOrderId = res.order.id;
          levelState.orderSide = OrderSideEnum.BUY;
        } catch (err) {
          this.logger.warn(`Failed to place initial BUY grid order at ${price}: ${(err as Error).message}`);
        }
      } else if (priceBN.isGreaterThan(currentPriceBN)) {
        // Mức giá cao hơn giá thị trường: chờ nấc mua khớp để chốt lời (hoặc đặt SELL nếu đã có sẵn coin)
        levelState.status = 'IDLE';
      }

      gridLevels.push(levelState);
    }

    this.activeBots.set(bot.id, {
      botId: bot.id,
      userId: bot.userId,
      symbol: bot.symbol,
      botType: bot.botType,
      isActive: true,
      gridLevels,
    });

    this.logger.log(`Grid Bot #${bot.id} started with ${levels} levels for ${bot.symbol} (Range: ${params.lowerPrice} - ${params.upperPrice})`);
  }

  /**
   * Dừng Grid Bot và hủy các lệnh đang mở trên sàn
   */
  async stopBot(botId: number): Promise<void> {
    const runtime = this.activeBots.get(botId);
    if (!runtime) return;

    if (runtime.gridLevels) {
      for (const level of runtime.gridLevels) {
        if (level.activeOrderId && (level.status === 'BUY_PLACED' || level.status === 'SELL_PLACED')) {
          try {
            await this.orderService.cancelOrder(runtime.userId, level.activeOrderId);
          } catch (err) {
            // Lệnh có thể đã khớp hoặc đã bị hủy
          }
        }
      }
    }

    this.activeBots.delete(botId);
    this.logger.log(`Grid Bot #${botId} stopped cleanly.`);
  }

  /**
   * Xử lý sự kiện Trade Executed: Khi 1 lệnh của bot được khớp, tự động sinh lệnh đối ứng
   */
  async handleTradeExecuted(trade: TradeDomainEvent): Promise<void> {
    for (const [botId, runtime] of this.activeBots.entries()) {
      if (runtime.symbol !== trade.symbol || !runtime.gridLevels) continue;

      const matchedLevel = runtime.gridLevels.find(
        (l) => l.activeOrderId === trade.buyOrderId || l.activeOrderId === trade.sellOrderId,
      );

      if (!matchedLevel) continue;

      // 1. Lệnh BUY LIMIT ở tầng i đã khớp -> Sinh lệnh SELL LIMIT ở tầng i+1 (Chốt lời)
      if (matchedLevel.activeOrderId === trade.buyOrderId && matchedLevel.orderSide === OrderSideEnum.BUY) {
        matchedLevel.status = 'BOUGHT';
        matchedLevel.activeOrderId = undefined;

        const nextLevelIndex = matchedLevel.index + 1;
        if (nextLevelIndex < runtime.gridLevels.length) {
          const targetLevel = runtime.gridLevels[nextLevelIndex];
          try {
            const idempotencyKey = `grid-${botId}-sell-${targetLevel.index}-${Date.now()}`;
            const res = await this.orderService.createOrder(
              runtime.userId,
              idempotencyKey,
              {
                symbol: runtime.symbol,
                side: OrderSideEnum.SELL,
                type: OrderTypeEnum.LIMIT,
                price: targetLevel.price,
                quantity: trade.quantity,
              },
            );

            targetLevel.status = 'SELL_PLACED';
            targetLevel.activeOrderId = res.order.id;
            targetLevel.orderSide = OrderSideEnum.SELL;

            // Tính lợi nhuận chốt lời ước tính: (Price_Sell - Price_Buy) * Qty
            const profitBN = new BigNumber(targetLevel.price)
              .minus(new BigNumber(matchedLevel.price))
              .multipliedBy(new BigNumber(trade.quantity));

            await this.updateBotPnl(botId, profitBN.toFixed(8));
          } catch (err) {
            this.logger.warn(`Grid Bot #${botId} failed to place counterpart SELL order: ${(err as Error).message}`);
          }
        }
      }

      // 2. Lệnh SELL LIMIT ở tầng j đã khớp -> Sinh lệnh BUY LIMIT ở tầng j-1 (Mua lại vòng mới)
      if (matchedLevel.activeOrderId === trade.sellOrderId && matchedLevel.orderSide === OrderSideEnum.SELL) {
        matchedLevel.status = 'IDLE';
        matchedLevel.activeOrderId = undefined;

        const prevLevelIndex = matchedLevel.index - 1;
        if (prevLevelIndex >= 0) {
          const targetLevel = runtime.gridLevels[prevLevelIndex];
          try {
            const idempotencyKey = `grid-${botId}-buy-${targetLevel.index}-${Date.now()}`;
            const res = await this.orderService.createOrder(
              runtime.userId,
              idempotencyKey,
              {
                symbol: runtime.symbol,
                side: OrderSideEnum.BUY,
                type: OrderTypeEnum.LIMIT,
                price: targetLevel.price,
                quantity: trade.quantity,
              },
            );

            targetLevel.status = 'BUY_PLACED';
            targetLevel.activeOrderId = res.order.id;
            targetLevel.orderSide = OrderSideEnum.BUY;

            await this.updateBotPnl(botId, '0.00000000', 1);
          } catch (err) {
            this.logger.warn(`Grid Bot #${botId} failed to place counterpart BUY order: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  private async updateBotPnl(botId: number, profitAdded: string, tradesInc = 1): Promise<void> {
    const bot = await this.botConfigRepo.findOne({ where: { id: botId } });
    if (!bot) return;

    const newPnl = new BigNumber(bot.realizedPnl).plus(new BigNumber(profitAdded)).toFixed(8);
    bot.realizedPnl = newPnl;
    bot.totalTradesCount += tradesInc;
    bot.lastRunAt = new Date();

    await this.botConfigRepo.save(bot);
  }

  getActiveBotsCount(): number {
    return this.activeBots.size;
  }

  getBotRuntime(botId: number): BotRuntimeState | undefined {
    return this.activeBots.get(botId);
  }
}
