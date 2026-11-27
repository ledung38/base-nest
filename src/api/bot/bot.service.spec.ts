import { BotTypeEnum } from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { BotService } from './bot.service';

describe('BotService (Algorithmic Trading Bot Manager)', () => {
  let service: BotService;
  let mockBotConfigRepo: any;
  let mockGridWorker: any;
  let mockSignalWorker: any;
  let mockRabbitmqService: any;

  beforeEach(() => {
    mockBotConfigRepo = {
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 1 })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockGridWorker = {
      startBot: jest.fn().mockResolvedValue(undefined),
      stopBot: jest.fn().mockResolvedValue(undefined),
      handleTradeExecuted: jest.fn().mockResolvedValue(undefined),
    };

    mockSignalWorker = {
      startBot: jest.fn().mockResolvedValue(undefined),
      stopBot: jest.fn().mockResolvedValue(undefined),
      handleSignal: jest.fn().mockResolvedValue('ACK'),
      getStatus: jest.fn().mockReturnValue({
        activeAlphaBots: 1,
        totalSignalsReceived: 5,
        totalOrdersTriggered: 2,
        totalSkippedStale: 0,
        totalSkippedDuplicate: 1,
        totalSkippedNoMatch: 2,
        totalOrderErrors: 0,
        lastSignalId: 'ALPHA_CONFLUENCE_01:BTCUSDT:5m:1795478400000',
        lastSignalLatencyMs: 850,
        lastQueueLagMs: 12,
      }),
    };

    mockRabbitmqService = {
      registerEventConsumer: jest.fn().mockResolvedValue(undefined),
      registerSignalConsumer: jest.fn().mockResolvedValue(undefined),
    };

    service = new BotService(
      mockBotConfigRepo,
      mockGridWorker,
      mockSignalWorker,
      mockRabbitmqService,
    );
  });

  describe('onModuleInit', () => {
    it('should register both trade event consumer and alpha signal consumer', async () => {
      await service.onModuleInit();

      expect(mockRabbitmqService.registerEventConsumer).toHaveBeenCalledWith(
        'bots.events.queue',
        'trade.*',
        expect.any(Function),
      );
      expect(mockRabbitmqService.registerSignalConsumer).toHaveBeenCalledWith(
        expect.any(Function),
      );
    });
  });

  describe('createBot', () => {
    it('should create a new Grid Bot configuration with inactive state', async () => {
      const dto = {
        name: 'My BTC Grid',
        botType: BotTypeEnum.GRID_TRADING,
        symbol: 'BTCUSDT',
        parameters: {
          lowerPrice: '60000.00',
          upperPrice: '70000.00',
          gridLevels: 5,
          quantityPerGrid: '0.01000000',
        },
      };

      const bot = await service.createBot(10, dto);

      expect(bot.name).toBe('My BTC Grid');
      expect(bot.botType).toBe(BotTypeEnum.GRID_TRADING);
      expect(bot.symbol).toBe('BTCUSDT');
      expect(bot.isActive).toBe(false);
      expect(bot.realizedPnl).toBe('0.00000000');
      expect(mockBotConfigRepo.save).toHaveBeenCalled();
    });

    it('should automatically start Alpha Signal bot if autoStart is true', async () => {
      const dto = {
        name: 'BTC Alpha Confluence 5m',
        botType: BotTypeEnum.ALPHA_SIGNAL,
        symbol: 'BTCUSDT',
        parameters: {
          strategyCode: 'ALPHA_CONFLUENCE_01',
          candleInterval: '5m',
          orderQuantity: '0.02000000',
        },
        autoStart: true,
      };

      mockBotConfigRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 10,
        ...dto,
        isActive: false,
      });

      const bot = await service.createBot(10, dto);

      expect(mockSignalWorker.startBot).toHaveBeenCalled();
      expect(bot.isActive).toBe(true);
    });
  });

  describe('startBot and stopBot', () => {
    it('should start an inactive Grid bot and dispatch to GridTradingWorker', async () => {
      const existingBot: BotConfig = {
        id: 5,
        userId: 10,
        name: 'Grid Bot #5',
        botType: BotTypeEnum.GRID_TRADING,
        symbol: 'BTCUSDT',
        parameters: {
          lowerPrice: '60000',
          upperPrice: '70000',
          gridLevels: 5,
          quantityPerGrid: '0.01',
        },
        isActive: false,
        realizedPnl: '0.00000000',
        totalTradesCount: 0,
        lastSignal: null,
        lastRunAt: null,
      } as unknown as BotConfig;

      mockBotConfigRepo.findOne.mockResolvedValue(existingBot);

      const started = await service.startBot(10, 5);

      expect(started.isActive).toBe(true);
      expect(mockGridWorker.startBot).toHaveBeenCalledWith(existingBot);
      expect(mockBotConfigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should stop an active Alpha Signal bot and dispatch stop to SignalConsumerService', async () => {
      const activeBot: BotConfig = {
        id: 6,
        userId: 10,
        name: 'Alpha Bot #6',
        botType: BotTypeEnum.ALPHA_SIGNAL,
        symbol: 'BTCUSDT',
        parameters: {},
        isActive: true,
      } as unknown as BotConfig;

      mockBotConfigRepo.findOne.mockResolvedValue(activeBot);

      const stopped = await service.stopBot(10, 6);

      expect(stopped.isActive).toBe(false);
      expect(mockSignalWorker.stopBot).toHaveBeenCalledWith(6);
    });
  });

  describe('restoreActiveBots', () => {
    it('should restore and activate all Grid and Alpha Signal bots where isActive=true', async () => {
      const activeBots = [
        { id: 1, botType: BotTypeEnum.GRID_TRADING, isActive: true },
        { id: 2, botType: BotTypeEnum.ALPHA_SIGNAL, isActive: true },
      ] as BotConfig[];

      mockBotConfigRepo.find.mockResolvedValue(activeBots);

      await service.restoreActiveBots();

      expect(mockGridWorker.startBot).toHaveBeenCalledWith(activeBots[0]);
      expect(mockSignalWorker.startBot).toHaveBeenCalledWith(activeBots[1]);
    });
  });
});
