import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BigNumber from 'bignumber.js';
import { AccountService } from 'src/api/account/account.service';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import { MarketTick } from 'src/api/market/market.interface';
import { OrderRabbitmqService } from 'src/api/order/order-rabbitmq.service';
import {
  OrderDomainEvent,
  TradeDomainEvent,
} from 'src/api/order/order.interface';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { Order } from 'src/entities/order.entity';
import { Trade } from 'src/entities/trade.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  MatchFill,
  OrderBookDepth,
  OrderBookEntry,
} from './matching.interface';
import { OrderBook } from './orderbook';

@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly logger = new Logger(MatchingService.name);
  private readonly orderbooks = new Map<string, OrderBook>();
  private readonly MATCHING_EVENT_QUEUE = 'matching.events.queue';

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Trade)
    private readonly tradeRepo: Repository<Trade>,
    private readonly dataSource: DataSource,
    private readonly accountService: AccountService,
    private readonly candleAggregator: CandleAggregatorService,
    private readonly rabbitmqService: OrderRabbitmqService,
  ) {
    // 1. Khởi tạo In-Memory Orderbook cho các cặp giao dịch được hỗ trợ
    for (const s of this.candleAggregator.getSupportedSymbols()) {
      this.orderbooks.set(s.symbol, new OrderBook(s.symbol));
    }
  }

  async onModuleInit() {
    // 2. Khôi phục các lệnh Limit đang treo từ PostgreSQL vào RAM (Durability recovery sau khi restart)
    await this.restoreRestingOrdersFromDb();

    // 3. Đăng ký consumer lắng nghe sự kiện từ Topic Exchange 'fintrade.events'
    await this.rabbitmqService.registerEventConsumer(
      this.MATCHING_EVENT_QUEUE,
      'order.*',
      async (routingKey, payload) => {
        await this.handleOrderDomainEvent(routingKey, payload as OrderDomainEvent);
      },
    );

    // 4. Lắng nghe luồng tick trực tiếp từ Binance để kích hoạt Paper-Trading Limit Fills
    this.candleAggregator.onTick(async (tick) => {
      await this.processMarketTick(tick);
    });
  }

  /**
   * Khôi phục các lệnh PENDING / PARTIALLY_FILLED vào Sổ Lệnh trong RAM
   */
  async restoreRestingOrdersFromDb(): Promise<number> {
    try {
      const activeOrders = await this.orderRepo.find({
        where: [
          { status: OrderStatusEnum.PENDING },
          { status: OrderStatusEnum.PARTIALLY_FILLED },
        ],
        order: { createdAt: 'ASC' },
      });

      let restoredCount = 0;
      for (const ord of activeOrders) {
        const ob = this.orderbooks.get(ord.symbol);
        if (!ob) continue;

        const unfilled = new BigNumber(ord.quantity)
          .minus(new BigNumber(ord.filledQuantity))
          .toFixed(8);

        if (new BigNumber(unfilled).isGreaterThan(0)) {
          ob.addOrder({
            orderId: ord.id,
            userId: ord.userId,
            symbol: ord.symbol,
            side: ord.side,
            type: ord.type,
            price: ord.price,
            quantity: ord.quantity,
            unfilledQuantity: unfilled,
            lockedCurrency: ord.lockedCurrency,
            lockedAmount: ord.lockedAmount,
            createdAt: ord.createdAt.getTime(),
          });
          restoredCount += 1;
        }
      }

      this.logger.log(
        `Restored ${restoredCount} resting limit orders into In-Memory Orderbooks across supported symbols.`,
      );
      return restoredCount;
    } catch (err) {
      this.logger.error('Failed to restore resting orders from database:', err);
      return 0;
    }
  }

  /**
   * Xử lý sự kiện Domain Event nhận được từ RabbitMQ ('order.pending', 'order.cancelled')
   */
  private async handleOrderDomainEvent(
    routingKey: string,
    event: OrderDomainEvent,
  ): Promise<void> {
    if (routingKey === 'order.cancelled') {
      const ob = this.orderbooks.get(event.symbol);
      if (ob) {
        ob.removeOrder(event.orderId);
        this.logger.log(
          `Removed cancelled order #${event.orderId} from in-memory orderbook [${event.symbol}]`,
        );
      }
      return;
    }

    if (routingKey === 'order.pending') {
      const order = await this.orderRepo.findOne({
        where: { id: event.orderId },
      });

      if (!order) {
        this.logger.warn(`Order #${event.orderId} not found for matching.`);
        return;
      }

      await this.processIncomingOrder(order);
    }
  }

  /**
   * Khớp lệnh đầu vào (Taker) với Sổ Lệnh nội bộ hoặc Simulated Market Maker Binance
   */
  async processIncomingOrder(order: Order): Promise<Trade[]> {
    const ob = this.orderbooks.get(order.symbol);
    if (!ob) {
      throw new NotFoundException(
        `Orderbook cho cặp ${order.symbol} không tồn tại`,
      );
    }

    const unfilledQty = new BigNumber(order.quantity)
      .minus(new BigNumber(order.filledQuantity))
      .toFixed(8);

    if (new BigNumber(unfilledQty).isLessThanOrEqualTo(0)) {
      return [];
    }

    const entry: OrderBookEntry = {
      orderId: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: order.price,
      quantity: order.quantity,
      unfilledQuantity: unfilledQty,
      lockedCurrency: order.lockedCurrency,
      lockedAmount: order.lockedAmount,
      createdAt: order.createdAt.getTime(),
    };

    let matchResult;
    if (order.type === OrderTypeEnum.LIMIT) {
      matchResult = ob.matchLimitOrder(entry);
    } else {
      const latestTick = this.candleAggregator.getLatestPrice(order.symbol);
      matchResult = ob.matchMarketOrder(entry, latestTick?.price);
    }

    const executedTrades: Trade[] = [];

    // Thực hiện quyết toán số cái và cập nhật trạng thái lệnh trong CSDL
    for (const fill of matchResult.fills) {
      const trade = await this.settleFill(fill);
      executedTrades.push(trade);
    }

    // Cập nhật trạng thái cuối cùng của Taker Order
    await this.updateTakerOrderStatus(order.id, matchResult.unfilledQuantity);

    return executedTrades;
  }

  /**
   * Khớp các lệnh LIMIT đang treo trong Sổ Lệnh dựa trên Tick giá thực tế từ Binance (Paper-Trading Engine)
   */
  async processMarketTick(tick: MarketTick): Promise<Trade[]> {
    const ob = this.orderbooks.get(tick.symbol);
    if (!ob) return [];

    const fills = ob.matchRestingOrdersAgainstTick(tick.price);
    if (fills.length === 0) return [];

    const executedTrades: Trade[] = [];
    for (const fill of fills) {
      try {
        const trade = await this.settleFill(fill);
        executedTrades.push(trade);
      } catch (err) {
        this.logger.error(
          `Error settling tick fill for order #${fill.takerOrderId}: ${(err as Error).message}`,
        );
      }
    }

    return executedTrades;
  }

  /**
   * Thực hiện thanh toán cấn trừ (Trade Settlement) và ghi sổ cái kép cho một Match Fill
   */
  async settleFill(fill: MatchFill): Promise<Trade> {
    const symInfo = this.candleAggregator
      .getSupportedSymbols()
      .find((s) => s.symbol === fill.symbol);

    if (!symInfo) {
      throw new NotFoundException(`Symbol ${fill.symbol} không hợp lệ`);
    }

    const baseCurrency = symInfo.baseCurrency as CurrencyEnum;
    const quoteCurrency = symInfo.quoteCurrency as CurrencyEnum;

    let savedTrade!: Trade;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Xác định Buyer Order ID và Seller Order ID
      const buyOrderId =
        fill.takerSide === OrderSideEnum.BUY
          ? fill.takerOrderId
          : fill.makerOrderId;
      const sellOrderId =
        fill.takerSide === OrderSideEnum.SELL
          ? fill.takerOrderId
          : fill.makerOrderId;

      const buyerId =
        fill.takerSide === OrderSideEnum.BUY
          ? fill.takerUserId
          : fill.makerUserId;
      const sellerId =
        fill.takerSide === OrderSideEnum.SELL
          ? fill.takerUserId
          : fill.makerUserId;

      // 2. Tạo bản ghi Trade
      const newTrade = manager.create(Trade, {
        symbol: fill.symbol,
        buyOrderId,
        sellOrderId,
        buyerId,
        sellerId,
        price: fill.price,
        quantity: fill.quantity,
        quoteAmount: fill.quoteAmount,
        takerSide: fill.takerSide,
        isSimulatedLiquidity: fill.isSimulatedLiquidity,
        buyerFee: '0.00000000',
        sellerFee: '0.00000000',
      });
      savedTrade = await manager.save(Trade, newTrade);

      // 3. Quyết toán phía BUYER (Chi USDT đang bị khóa, nhận Base Coin vào Available)
      if (buyerId !== null) {
        await this.accountService.settleTrade(
          buyerId,
          quoteCurrency,
          fill.quoteAmount,
          baseCurrency,
          fill.quantity,
          `TRADE-${savedTrade.id}`,
          `TX-BUY-${savedTrade.id}`,
          manager,
        );
      }

      // 4. Quyết toán phía SELLER (Chi Base Coin đang bị khóa, nhận USDT vào Available)
      if (sellerId !== null) {
        await this.accountService.settleTrade(
          sellerId,
          baseCurrency,
          fill.quantity,
          quoteCurrency,
          fill.quoteAmount,
          `TRADE-${savedTrade.id}`,
          `TX-SELL-${savedTrade.id}`,
          manager,
        );
      }

      // 5. Cập nhật Maker Order trong DB (nếu có Maker)
      if (fill.makerOrderId) {
        await this.updateOrderAfterFill(
          fill.makerOrderId,
          fill.quantity,
          fill.price,
          fill.quoteAmount,
          manager,
        );
      }

      // 6. Cập nhật Taker Order trong DB
      if (fill.takerOrderId && fill.takerOrderId !== fill.makerOrderId) {
        await this.updateOrderAfterFill(
          fill.takerOrderId,
          fill.quantity,
          fill.price,
          fill.quoteAmount,
          manager,
        );
      }
    });

    // 7. Bắn sự kiện Domain Event 'trade.executed' ra Topic Exchange (cho Centrifugo & Bot)
    const tradeEvent: TradeDomainEvent = {
      event: 'trade.executed',
      tradeId: savedTrade.id,
      symbol: savedTrade.symbol,
      buyOrderId: savedTrade.buyOrderId,
      sellOrderId: savedTrade.sellOrderId,
      buyerId: savedTrade.buyerId,
      sellerId: savedTrade.sellerId,
      price: savedTrade.price,
      quantity: savedTrade.quantity,
      quoteAmount: savedTrade.quoteAmount,
      takerSide: savedTrade.takerSide,
      isSimulatedLiquidity: savedTrade.isSimulatedLiquidity,
      timestamp: Date.now(),
    };

    await this.rabbitmqService.publishEvent(tradeEvent);

    return savedTrade;
  }

  /**
   * Cập nhật số lượng đã khớp và số tiền ký quỹ còn lại của lệnh sau mỗi lượt fill
   */
  private async updateOrderAfterFill(
    orderId: number,
    filledQtyStr: string,
    matchPriceStr: string,
    quoteAmountStr: string,
    manager: EntityManager,
  ): Promise<void> {
    const order = await manager
      .createQueryBuilder(Order, 'ord')
      .setLock('pessimistic_write')
      .where('ord.id = :orderId', { orderId })
      .getOne();

    if (!order) return;

    const fillQtyBN = new BigNumber(filledQtyStr);
    const newFilledQtyBN = new BigNumber(order.filledQuantity).plus(fillQtyBN);
    const totalQtyBN = new BigNumber(order.quantity);

    order.filledQuantity = newFilledQtyBN.toFixed(8);

    const isFullyFilled = newFilledQtyBN.isGreaterThanOrEqualTo(totalQtyBN);

    if (isFullyFilled) {
      order.status = OrderStatusEnum.FILLED;

      // Nếu là BUY limit mà khớp với giá Maker rẻ hơn hoặc tick rẻ hơn (Price Improvement):
      // Hoàn trả phần tiền ký quỹ thặng dư còn dư về available balance của User!
      const lockedRemainsBN = new BigNumber(order.lockedAmount).minus(
        order.side === OrderSideEnum.BUY
          ? new BigNumber(quoteAmountStr)
          : fillQtyBN,
      );

      if (lockedRemainsBN.isGreaterThan(0)) {
        await this.accountService.unlockBalance(
          order.userId,
          order.lockedCurrency,
          lockedRemainsBN.toFixed(8),
          `ORDER-${order.id}`,
          `TX-REFUND-SURPLUS-${order.id}`,
          manager,
        );
      }

      order.lockedAmount = '0.00000000';
    } else {
      order.status = OrderStatusEnum.PARTIALLY_FILLED;
      const deductLockedBN =
        order.side === OrderSideEnum.BUY
          ? new BigNumber(quoteAmountStr)
          : fillQtyBN;

      const newLockedBN = BigNumber.maximum(
        0,
        new BigNumber(order.lockedAmount).minus(deductLockedBN),
      );
      order.lockedAmount = newLockedBN.toFixed(8);
    }

    await manager.save(Order, order);
  }

  /**
   * Cập nhật trạng thái Taker order sau khi khớp toàn bộ lượt trong phiên
   */
  private async updateTakerOrderStatus(
    orderId: number,
    unfilledQtyStr: string,
  ): Promise<void> {
    const isUnfilledZero = new BigNumber(unfilledQtyStr).isLessThanOrEqualTo(0);
    if (!isUnfilledZero) return;

    await this.orderRepo.update(
      { id: orderId },
      {
        status: OrderStatusEnum.FILLED,
        lockedAmount: '0.00000000',
      },
    );
  }

  /**
   * Lấy L2 Orderbook Depth cho cặp coin
   */
  getOrderBookDepth(symbol: string, limit = 20): OrderBookDepth {
    const ob = this.orderbooks.get(symbol.toUpperCase());
    if (!ob) {
      throw new NotFoundException(`Symbol ${symbol} không được hỗ trợ`);
    }
    return ob.getDepth(limit);
  }

  /**
   * Lấy lịch sử các giao dịch gần đây của 1 cặp coin
   */
  async getRecentTrades(symbol: string, limit = 50): Promise<Trade[]> {
    return this.tradeRepo.find({
      where: { symbol: symbol.toUpperCase() },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Lấy lịch sử giao dịch của người dùng
   */
  async getUserTrades(userId: number, limit = 50): Promise<Trade[]> {
    return this.tradeRepo.find({
      where: [{ buyerId: userId }, { sellerId: userId }],
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Lấy instance OrderBook (cho mục đích test)
   */
  getOrderBookInstance(symbol: string): OrderBook | undefined {
    return this.orderbooks.get(symbol.toUpperCase());
  }
}
