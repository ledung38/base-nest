import { BotTypeEnum, OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { GridTradingWorker } from './grid-trading.worker';

describe('GridTradingWorker (High-Frequency Grid Scalping Strategy)', () => {
  let worker: GridTradingWorker;
  let mockBotConfigRepo: any;
  let mockOrderService: any;
  let mockCandleAggregator: any;

  beforeEach(() => {
    mockBotConfigRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        realizedPnl: '0.00000000',
        totalTradesCount: 0,
      }),
      save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
    };

    mockOrderService = {
      createOrder: jest.fn().mockResolvedValue({
        order: { id: 101, status: 'QUEUED' },
      }),
      cancelOrder: jest.fn().mockResolvedValue({}),
    };

    mockCandleAggregator = {
      getLatestPrice: jest.fn().mockReturnValue({
        symbol: 'BTCUSDT',
        price: '65000.00',
        timestamp: Date.now(),
      }),
    };

    worker = new GridTradingWorker(
      mockBotConfigRepo,
      mockOrderService,
      mockCandleAggregator,
    );
  });

  describe('startBot', () => {
    it('should calculate 5 grid levels and place initial BUY limit orders below current market price', async () => {
      const bot = {
        id: 1,
        userId: 10,
        symbol: 'BTCUSDT',
        botType: BotTypeEnum.GRID_TRADING,
        parameters: {
          lowerPrice: '60000.00',
          upperPrice: '70000.00',
          gridLevels: 5,
          quantityPerGrid: '0.01000000',
        },
      } as unknown as BotConfig;

      // Current price = 65,000
      // Levels: 60,000 (0), 62,500 (1), 65,000 (2), 67,500 (3), 70,000 (4)
      // Levels < 65,000: 60,000 and 62,500 (2 buy orders placed)
      await worker.startBot(bot);

      expect(mockOrderService.createOrder).toHaveBeenCalledTimes(2);

      // Lệnh 1 tại 60000.00
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        10,
        expect.stringContaining('grid-1-buy-0-'),
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '60000.00',
          quantity: '0.01000000',
        }),
      );

      // Lệnh 2 tại 62500.00
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        10,
        expect.stringContaining('grid-1-buy-1-'),
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '62500.00',
          quantity: '0.01000000',
        }),
      );

      expect(worker.getActiveBotsCount()).toBe(1);
    });
  });

  describe('handleTradeExecuted (Counterpart Order & Profit Realization)', () => {
    it('should place counterpart SELL limit order at upper level when BUY level is filled, and credit profit', async () => {
      const bot = {
        id: 1,
        userId: 10,
        symbol: 'BTCUSDT',
        botType: BotTypeEnum.GRID_TRADING,
        parameters: {
          lowerPrice: '60000.00',
          upperPrice: '70000.00',
          gridLevels: 5,
          quantityPerGrid: '0.01000000',
        },
      } as unknown as BotConfig;

      // Giả lập bot đặt lệnh BUY với orderId = 101 ở level 1 (62,500.00)
      mockOrderService.createOrder.mockResolvedValueOnce({
        order: { id: 100, status: 'QUEUED' },
      }).mockResolvedValueOnce({
        order: { id: 101, status: 'QUEUED' },
      });

      await worker.startBot(bot);

      // Trade executed: order #101 được khớp mua thành công 0.01 BTC tại giá 62500.00
      const tradeEvent = {
        event: 'trade.executed' as const,
        tradeId: 999,
        symbol: 'BTCUSDT',
        buyOrderId: 101,
        sellOrderId: 200,
        buyerId: 10,
        sellerId: 99,
        price: '62500.00',
        quantity: '0.01000000',
        quoteAmount: '625.00000000',
        takerSide: OrderSideEnum.BUY,
        isSimulatedLiquidity: false,
        timestamp: Date.now(),
      };

      await worker.handleTradeExecuted(tradeEvent);

      // Xác thực bot lập tức sinh lệnh SELL đối ứng tại level 2 (65,000.00)
      expect(mockOrderService.createOrder).toHaveBeenCalledWith(
        10,
        expect.stringContaining('grid-1-sell-2-'),
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: OrderSideEnum.SELL,
          type: OrderTypeEnum.LIMIT,
          price: '65000.00',
          quantity: '0.01000000',
        }),
      );

      // Lợi nhuận chốt lời: (65,000 - 62,500) * 0.01 = 25.00 USDT
      expect(mockBotConfigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          realizedPnl: '25.00000000',
          totalTradesCount: 1,
        }),
      );
    });
  });

  describe('stopBot', () => {
    it('should cancel active orders and clean up runtime state', async () => {
      const bot = {
        id: 1,
        userId: 10,
        symbol: 'BTCUSDT',
        botType: BotTypeEnum.GRID_TRADING,
        parameters: {
          lowerPrice: '60000.00',
          upperPrice: '70000.00',
          gridLevels: 5,
          quantityPerGrid: '0.01000000',
        },
      } as unknown as BotConfig;

      await worker.startBot(bot);
      expect(worker.getActiveBotsCount()).toBe(1);

      await worker.stopBot(1);

      expect(mockOrderService.cancelOrder).toHaveBeenCalled();
      expect(worker.getActiveBotsCount()).toBe(0);
    });
  });
});
