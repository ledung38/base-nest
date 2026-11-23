import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { RealtimeConsumerService } from './realtime-consumer.service';

describe('RealtimeConsumerService (Event Bridge & Multi-Channel Broadcast)', () => {
  let service: RealtimeConsumerService;
  let mockRealtimeService: any;
  let mockRabbitmqService: any;
  let mockMatchingService: any;
  let mockCandleAggregator: any;
  let mockOrderbookThrottler: any;

  beforeEach(() => {
    mockRealtimeService = {
      publish: jest.fn().mockResolvedValue(true),
      broadcast: jest.fn().mockResolvedValue(true),
    };

    mockRabbitmqService = {
      registerEventConsumer: jest.fn().mockResolvedValue(undefined),
    };

    mockMatchingService = {
      getOrderBookDepth: jest.fn().mockReturnValue({
        symbol: 'BTCUSDT',
        bids: [{ price: '65000.00', quantity: '1.00000000', orderCount: 1 }],
        asks: [{ price: '65500.00', quantity: '0.50000000', orderCount: 1 }],
        timestamp: Date.now(),
      }),
    };

    mockCandleAggregator = {
      onTick: jest.fn(),
      onCandle: jest.fn(),
    };

    mockOrderbookThrottler = {
      trigger: jest.fn().mockImplementation((symbol, action) => action(symbol)),
    };

    service = new RealtimeConsumerService(
      mockRealtimeService,
      mockRabbitmqService,
      mockMatchingService,
      mockCandleAggregator,
      mockOrderbookThrottler,
    );
  });

  describe('handleDomainEvent - Order Events', () => {
    it('should route order.pending event to personal channel and trigger depth throttle', async () => {
      const orderEvent = {
        event: 'order.pending',
        orderId: 101,
        userId: 55,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '1.00000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '65000.00',
        status: OrderStatusEnum.PENDING,
        timestamp: Date.now(),
      };

      await service.handleDomainEvent('order.pending', orderEvent);

      // Bắn vào kênh cá nhân personal:55
      expect(mockRealtimeService.publish).toHaveBeenCalledWith(
        'personal:55',
        expect.objectContaining({
          type: 'ORDER_UPDATE',
          event: 'order.pending',
        }),
      );

      // Kích hoạt depth throttler cho BTCUSDT
      expect(mockOrderbookThrottler.trigger).toHaveBeenCalledWith(
        'BTCUSDT',
        expect.any(Function),
      );
    });
  });

  describe('handleDomainEvent - Trade Events', () => {
    it('should route trade.executed to public trades, buyer personal channel, and seller personal channel', async () => {
      const tradeEvent = {
        event: 'trade.executed',
        tradeId: 999,
        symbol: 'BTCUSDT',
        buyOrderId: 101,
        sellOrderId: 102,
        buyerId: 55,
        sellerId: 66,
        price: '65000.00',
        quantity: '0.50000000',
        quoteAmount: '32500.00000000',
        takerSide: OrderSideEnum.BUY,
        isSimulatedLiquidity: false,
        timestamp: Date.now(),
      };

      await service.handleDomainEvent('trade.executed', tradeEvent);

      // 1. Public tape: public:trades:BTCUSDT
      expect(mockRealtimeService.publish).toHaveBeenCalledWith(
        'public:trades:BTCUSDT',
        expect.objectContaining({
          type: 'TRADE_EXECUTED',
        }),
      );

      // 2. Buyer personal channel: personal:55
      expect(mockRealtimeService.publish).toHaveBeenCalledWith(
        'personal:55',
        expect.objectContaining({
          type: 'TRADE_EXECUTED',
          role: 'BUYER',
        }),
      );

      // 3. Seller personal channel: personal:66
      expect(mockRealtimeService.publish).toHaveBeenCalledWith(
        'personal:66',
        expect.objectContaining({
          type: 'TRADE_EXECUTED',
          role: 'SELLER',
        }),
      );

      // 4. Kích hoạt depth throttler
      expect(mockOrderbookThrottler.trigger).toHaveBeenCalledWith(
        'BTCUSDT',
        expect.any(Function),
      );
    });
  });

  describe('broadcastOrderbookDepth', () => {
    it('should query depth from matching service and publish to public:orderbook:<symbol>', async () => {
      await service.broadcastOrderbookDepth('BTCUSDT');

      expect(mockMatchingService.getOrderBookDepth).toHaveBeenCalledWith(
        'BTCUSDT',
        20,
      );
      expect(mockRealtimeService.publish).toHaveBeenCalledWith(
        'public:orderbook:BTCUSDT',
        expect.objectContaining({
          type: 'DEPTH',
        }),
      );
    });
  });
});
