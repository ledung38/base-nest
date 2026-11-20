import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { Order } from 'src/entities/order.entity';
import { Trade } from 'src/entities/trade.entity';
import { MatchingService } from './matching.service';

describe('MatchingService (Matching Engine & Trade Settlement)', () => {
  let service: MatchingService;
  let mockOrderRepo: any;
  let mockTradeRepo: any;
  let mockDataSource: any;
  let mockAccountService: any;
  let mockCandleAggregator: any;
  let mockRabbitmqService: any;
  let mockEntityManager: any;

  beforeEach(() => {
    mockOrderRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockTradeRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((entity) =>
        Promise.resolve({ id: 1001, ...entity }),
      ),
      create: jest.fn().mockImplementation((dto) => ({ ...dto })),
    };

    mockAccountService = {
      settleTrade: jest.fn().mockResolvedValue(undefined),
      unlockBalance: jest.fn().mockResolvedValue(undefined),
    };

    mockCandleAggregator = {
      getSupportedSymbols: jest.fn().mockReturnValue([
        {
          symbol: 'BTCUSDT',
          baseCurrency: 'BTC',
          quoteCurrency: 'USDT',
          priceDecimals: 2,
          quantityDecimals: 5,
        },
        {
          symbol: 'ETHUSDT',
          baseCurrency: 'ETH',
          quoteCurrency: 'USDT',
          priceDecimals: 2,
          quantityDecimals: 4,
        },
        {
          symbol: 'SOLUSDT',
          baseCurrency: 'SOL',
          quoteCurrency: 'USDT',
          priceDecimals: 2,
          quantityDecimals: 3,
        },
      ]),
      getLatestPrice: jest.fn().mockReturnValue({
        symbol: 'BTCUSDT',
        price: '65000.00',
        quantity: '1.0',
        timestamp: Date.now(),
      }),
      onTick: jest.fn(),
    };

    mockRabbitmqService = {
      registerEventConsumer: jest.fn().mockResolvedValue(undefined),
      publishEvent: jest.fn().mockResolvedValue(true),
    };

    mockEntityManager = {
      create: jest.fn().mockImplementation((entityClass, dto) => ({ ...dto })),
      save: jest.fn().mockImplementation((entityClass, entity) => {
        if (entityClass === Trade || !entityClass) {
          return Promise.resolve({ id: 1001, ...entity });
        }
        return Promise.resolve(entity);
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        return await cb(mockEntityManager);
      }),
    };

    service = new MatchingService(
      mockOrderRepo,
      mockTradeRepo,
      mockDataSource,
      mockAccountService,
      mockCandleAggregator,
      mockRabbitmqService,
    );
  });

  describe('restoreRestingOrdersFromDb', () => {
    it('should restore active PENDING and PARTIALLY_FILLED orders into RAM orderbooks', async () => {
      const mockOrders = [
        {
          id: 1,
          userId: 10,
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '64000.00',
          quantity: '1.00000000',
          filledQuantity: '0.00000000',
          lockedCurrency: 'USDT',
          lockedAmount: '64000.00',
          status: OrderStatusEnum.PENDING,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          id: 2,
          userId: 20,
          symbol: 'BTCUSDT',
          side: OrderSideEnum.SELL,
          type: OrderTypeEnum.LIMIT,
          price: '66000.00',
          quantity: '2.00000000',
          filledQuantity: '0.50000000', // unfilled = 1.5
          lockedCurrency: 'BTC',
          lockedAmount: '1.50000000',
          status: OrderStatusEnum.PARTIALLY_FILLED,
          createdAt: new Date('2026-01-01T00:01:00Z'),
        },
      ];

      mockOrderRepo.find.mockResolvedValue(mockOrders);

      const count = await service.restoreRestingOrdersFromDb();
      expect(count).toBe(2);

      const depth = service.getOrderBookDepth('BTCUSDT');
      expect(depth.bids).toHaveLength(1);
      expect(depth.bids[0].price).toBe('64000.00');
      expect(depth.asks).toHaveLength(1);
      expect(depth.asks[0].price).toBe('66000.00');
      expect(depth.asks[0].quantity).toBe('1.50000000');
    });
  });

  describe('processIncomingOrder (P2P Matching & Double-Entry Settlement)', () => {
    it('should match incoming Buy Limit with existing Ask on the book and settle trade for both parties', async () => {
      const ob = service.getOrderBookInstance('BTCUSDT');
      expect(ob).toBeDefined();

      // Giả lập Maker đặt bán 0.5 BTC @ 65000.00
      ob?.addOrder({
        orderId: 1,
        userId: 101, // Seller
        symbol: 'BTCUSDT',
        side: OrderSideEnum.SELL,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '0.50000000',
        unfilledQuantity: '0.50000000',
        lockedCurrency: 'BTC',
        lockedAmount: '0.50000000',
        createdAt: 1000,
      });

      // Giả lập DB trả về Maker Order khi lock để cập nhật
      const makerOrderDb = {
        id: 1,
        userId: 101,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.SELL,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '0.50000000',
        filledQuantity: '0.00000000',
        lockedCurrency: CurrencyEnum.BTC,
        lockedAmount: '0.50000000',
        status: OrderStatusEnum.PENDING,
      };

      const takerOrderDb = {
        id: 2,
        userId: 102, // Buyer
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '0.50000000',
        filledQuantity: '0.00000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '32500.00000000',
        status: OrderStatusEnum.PENDING,
        createdAt: new Date(),
      } as unknown as Order;

      mockEntityManager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockResolvedValueOnce(makerOrderDb)
          .mockResolvedValueOnce(takerOrderDb),
      });

      const trades = await service.processIncomingOrder(takerOrderDb);

      expect(trades).toHaveLength(1);
      const trade = trades[0];
      expect(trade.symbol).toBe('BTCUSDT');
      expect(trade.price).toBe('65000.00');
      expect(trade.quantity).toBe('0.50000000');
      expect(trade.quoteAmount).toBe('32500.00000000');
      expect(trade.buyerId).toBe(102);
      expect(trade.sellerId).toBe(101);
      expect(trade.isSimulatedLiquidity).toBe(false);

      // Xác thực settleTrade được gọi cho cả Buyer và Seller
      expect(mockAccountService.settleTrade).toHaveBeenCalledTimes(2);

      // Buyer: Spend USDT (locked), receive BTC (available)
      expect(mockAccountService.settleTrade).toHaveBeenCalledWith(
        102,
        CurrencyEnum.USDT,
        '32500.00000000',
        CurrencyEnum.BTC,
        '0.50000000',
        expect.stringContaining('TRADE-'),
        expect.any(String),
        mockEntityManager,
      );

      // Seller: Spend BTC (locked), receive USDT (available)
      expect(mockAccountService.settleTrade).toHaveBeenCalledWith(
        101,
        CurrencyEnum.BTC,
        '0.50000000',
        CurrencyEnum.USDT,
        '32500.00000000',
        expect.stringContaining('TRADE-'),
        expect.any(String),
        mockEntityManager,
      );

      // Xác thực bắn Domain Event 'trade.executed' ra RabbitMQ
      expect(mockRabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'trade.executed',
          symbol: 'BTCUSDT',
          price: '65000.00',
          quantity: '0.50000000',
        }),
      );
    });
  });

  describe('processIncomingOrder (Market Order & Simulated Liquidity)', () => {
    it('should fill Market Buy order immediately against live Binance price when internal book is empty', async () => {
      const marketBuyOrder = {
        id: 10,
        userId: 200,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.MARKET,
        price: '65000.00',
        quantity: '0.10000000',
        filledQuantity: '0.00000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '6500.00000000',
        status: OrderStatusEnum.PENDING,
        createdAt: new Date(),
      } as unknown as Order;

      mockEntityManager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(marketBuyOrder),
      });

      const trades = await service.processIncomingOrder(marketBuyOrder);

      expect(trades).toHaveLength(1);
      const trade = trades[0];
      expect(trade.isSimulatedLiquidity).toBe(true);
      expect(trade.buyerId).toBe(200);
      expect(trade.sellerId).toBeNull();
      expect(trade.price).toBe('65000.00');
      expect(trade.quantity).toBe('0.10000000');
      expect(trade.quoteAmount).toBe('6500.00000000');

      // Xác thực settle cho buyer
      expect(mockAccountService.settleTrade).toHaveBeenCalledWith(
        200,
        CurrencyEnum.USDT,
        '6500.00000000',
        CurrencyEnum.BTC,
        '0.10000000',
        expect.any(String),
        expect.any(String),
        mockEntityManager,
      );
    });
  });

  describe('processMarketTick (Binance Tick-Driven Limit Fills)', () => {
    it('should execute resting BUY limit order and refund surplus margin when tick price drops below limit price', async () => {
      const ob = service.getOrderBookInstance('BTCUSDT');
      // User treo lệnh BUY 1.0 BTC @ 65000 (đã khóa 65000 USDT)
      ob?.addOrder({
        orderId: 50,
        userId: 300,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '1.00000000',
        unfilledQuantity: '1.00000000',
        lockedCurrency: 'USDT',
        lockedAmount: '65000.00000000',
        createdAt: 1000,
      });

      const orderInDb = {
        id: 50,
        userId: 300,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '1.00000000',
        filledQuantity: '0.00000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '65000.00000000', // Đã khóa 65,000
        status: OrderStatusEnum.PENDING,
      };

      mockEntityManager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(orderInDb),
      });

      // Binance tick rớt giá xuống 64000.00 (Rẻ hơn mức user sẵn sàng trả 1,000 USDT)
      const tick: any = {
        symbol: 'BTCUSDT',
        price: '64000.00',
        quantity: '2.0',
        timestamp: Date.now(),
      };

      const trades = await service.processMarketTick(tick);

      expect(trades).toHaveLength(1);
      const trade = trades[0];
      expect(trade.price).toBe('64000.00');
      expect(trade.quantity).toBe('1.00000000');
      expect(trade.quoteAmount).toBe('64000.00000000'); // Chỉ tốn 64,000 USDT

      // Settle mua 1.0 BTC tốn 64,000 USDT
      expect(mockAccountService.settleTrade).toHaveBeenCalledWith(
        300,
        CurrencyEnum.USDT,
        '64000.00000000',
        CurrencyEnum.BTC,
        '1.00000000',
        expect.any(String),
        expect.any(String),
        mockEntityManager,
      );

      // QUAN TRỌNG: Xác thực Price Improvement - Hoàn trả thặng dư 1,000 USDT (65000 - 64000) về Available balance!
      expect(mockAccountService.unlockBalance).toHaveBeenCalledWith(
        300,
        CurrencyEnum.USDT,
        '1000.00000000',
        'ORDER-50',
        expect.stringContaining('TX-REFUND-SURPLUS-'),
        mockEntityManager,
      );
    });
  });
});
