import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import { MatchingService } from 'src/api/matching/matching.service';
import { OrderRabbitmqService } from 'src/api/order/order-rabbitmq.service';
import {
  OrderDomainEvent,
  TradeDomainEvent,
} from 'src/api/order/order.interface';
import { CENTRIFUGO_CHANNELS } from './realtime.interface';
import { RealtimeService } from './realtime.service';
import { OrderbookThrottler } from './throttler/orderbook-throttler';

@Injectable()
export class RealtimeConsumerService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeConsumerService.name);
  private readonly REALTIME_EVENT_QUEUE = 'realtime.events.queue';

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly rabbitmqService: OrderRabbitmqService,
    private readonly matchingService: MatchingService,
    private readonly candleAggregator: CandleAggregatorService,
    private readonly orderbookThrottler: OrderbookThrottler,
  ) {}

  async onModuleInit() {
    this.registerMarketDataStream();
    await this.registerDomainEventsConsumer();
  }

  /**
   * Đăng ký lắng nghe trực tiếp luồng Market Data (Ticks & Candles) từ Ingestion/Aggregator
   */
  private registerMarketDataStream(): void {
    // 1. Luồng Ticks giá thời gian thực từ Binance
    this.candleAggregator.onTick((tick) => {
      const channel = CENTRIFUGO_CHANNELS.ticks(tick.symbol);
      this.realtimeService.publish(channel, {
        type: 'TICK',
        data: tick,
      });
    });

    // 2. Luồng nến OHLCV (1s, 1m, 15m) phục vụ vẽ đồ thị TradingView Lightweight Charts
    this.candleAggregator.onCandle((candle, isClosed) => {
      const channel = CENTRIFUGO_CHANNELS.candles(
        candle.symbol,
        candle.interval,
      );
      this.realtimeService.publish(channel, {
        type: 'CANDLE',
        isClosed,
        data: candle,
      });
    });

    this.logger.log('Subscribed to CandleAggregator live ticks & candles stream for Centrifugo broadcast.');
  }

  /**
   * Đăng ký consumer từ RabbitMQ Topic Exchange 'fintrade.events'
   * Xử lý các sự kiện Order và Trade phát sinh từ hệ thống
   */
  private async registerDomainEventsConsumer(): Promise<void> {
    await this.rabbitmqService.registerEventConsumer(
      this.REALTIME_EVENT_QUEUE,
      '#', // Lắng nghe toàn bộ topic events (order.* và trade.*)
      async (routingKey, payload) => {
        await this.handleDomainEvent(routingKey, payload);
      },
    );

    this.logger.log(
      `Realtime consumer active on queue [${this.REALTIME_EVENT_QUEUE}] (bindingPattern='#')`,
    );
  }

  /**
   * Điều hướng xử lý từng loại Domain Event
   */
  async handleDomainEvent(routingKey: string, payload: any): Promise<void> {
    // 1. Xử lý các sự kiện liên quan đến Order: order.queued, order.pending, order.rejected, order.cancelled
    if (routingKey.startsWith('order.')) {
      const orderEvent = payload as OrderDomainEvent;

      // Bắn trực tiếp vào kênh cá nhân của User sở hữu lệnh
      if (orderEvent.userId) {
        const personalChannel = CENTRIFUGO_CHANNELS.personal(orderEvent.userId);
        await this.realtimeService.publish(personalChannel, {
          type: 'ORDER_UPDATE',
          event: routingKey,
          data: orderEvent,
        });
      }

      // Kích hoạt cập nhật Sổ Lệnh có kiểm soát tần suất (Throttle 100ms)
      if (orderEvent.symbol) {
        this.orderbookThrottler.trigger(orderEvent.symbol, (symbol) =>
          this.broadcastOrderbookDepth(symbol),
        );
      }
      return;
    }

    // 2. Xử lý sự kiện khớp lệnh thành công: trade.executed
    if (routingKey === 'trade.executed') {
      const tradeEvent = payload as TradeDomainEvent;

      // 2.1. Bắn vào kênh công khai các giao dịch vừa khớp của thị trường (Public Trades Tape)
      const publicTradesChannel = CENTRIFUGO_CHANNELS.trades(tradeEvent.symbol);
      await this.realtimeService.publish(publicTradesChannel, {
        type: 'TRADE_EXECUTED',
        data: tradeEvent,
      });

      // 2.2. Bắn thông báo khớp lệnh cá nhân cho Bên Mua (Buyer)
      if (tradeEvent.buyerId) {
        const buyerChannel = CENTRIFUGO_CHANNELS.personal(tradeEvent.buyerId);
        await this.realtimeService.publish(buyerChannel, {
          type: 'TRADE_EXECUTED',
          role: 'BUYER',
          data: tradeEvent,
        });
      }

      // 2.3. Bắn thông báo khớp lệnh cá nhân cho Bên Bán (Seller)
      if (tradeEvent.sellerId) {
        const sellerChannel = CENTRIFUGO_CHANNELS.personal(tradeEvent.sellerId);
        await this.realtimeService.publish(sellerChannel, {
          type: 'TRADE_EXECUTED',
          role: 'SELLER',
          data: tradeEvent,
        });
      }

      // 2.4. Kích hoạt cập nhật Sổ Lệnh (Throttle 100ms)
      this.orderbookThrottler.trigger(tradeEvent.symbol, (symbol) =>
        this.broadcastOrderbookDepth(symbol),
      );
    }
  }

  /**
   * Lấy snapshot L2 Depth mới nhất và phát qua Centrifugo
   */
  async broadcastOrderbookDepth(symbol: string): Promise<void> {
    try {
      const depth = this.matchingService.getOrderBookDepth(symbol, 20);
      const channel = CENTRIFUGO_CHANNELS.orderbook(symbol);

      await this.realtimeService.publish(channel, {
        type: 'DEPTH',
        data: depth,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast orderbook depth for ${symbol}: ${(err as Error).message}`,
      );
    }
  }
}
