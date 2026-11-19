import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from 'src/api/account/account.service';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { Order } from 'src/entities/order.entity';
import { DataSource, EntityManager } from 'typeorm';
import { OrderRabbitmqService } from './order-rabbitmq.service';
import { OrderQueueMessage } from './order.interface';
import { OrderService } from './order.service';

describe('OrderService (Order Submission, Idempotency & RabbitMQ Worker)', () => {
  let service: OrderService;
  let mockDataSource: Partial<DataSource>;
  let mockEntityManager: Partial<EntityManager>;
  let mockOrderRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockCacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let mockAccountService: {
    lockBalance: jest.Mock;
    unlockBalance: jest.Mock;
  };
  let mockCandleAggregator: {
    getSupportedSymbols: jest.Mock;
    getLatestPrice: jest.Mock;
  };
  let mockRabbitmqService: {
    registerOrderConsumer: jest.Mock;
    publishOrder: jest.Mock;
    publishEvent: jest.Mock;
  };

  beforeEach(async () => {
    mockOrderRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 101, ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    mockEntityManager = {
      createQueryBuilder: jest.fn(),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
    };

    mockDataSource = {
      getRepository: jest.fn().mockReturnValue(mockOrderRepo),
      transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(mockEntityManager as EntityManager);
      }),
    };

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockAccountService = {
      lockBalance: jest.fn().mockResolvedValue({}),
      unlockBalance: jest.fn().mockResolvedValue({}),
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
      ]),
      getLatestPrice: jest.fn(),
    };

    mockRabbitmqService = {
      registerOrderConsumer: jest.fn().mockResolvedValue(undefined),
      publishOrder: jest.fn().mockResolvedValue(true),
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: AccountService, useValue: mockAccountService },
        { provide: CandleAggregatorService, useValue: mockCandleAggregator },
        { provide: OrderRabbitmqService, useValue: mockRabbitmqService },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  describe('createOrder (Idempotency & RabbitMQ Publish)', () => {
    it('should throw BadRequestException when Idempotency-Key header is missing', async () => {
      await expect(
        service.createOrder(1, '', {
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '65000.00',
          quantity: '0.1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should replay cached order without creating duplicate when Idempotency-Key already completed', async () => {
      const cachedOrder = {
        id: 88,
        userId: 1,
        idempotencyKey: 'key-replay',
        symbol: 'BTCUSDT',
        status: OrderStatusEnum.QUEUED,
      } as Order;

      mockCacheManager.get.mockResolvedValue({
        status: 'COMPLETED',
        orderId: 88,
        order: cachedOrder,
        updatedAt: Date.now(),
      });

      const result = await service.createOrder(1, 'key-replay', {
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00',
        quantity: '0.1',
      });

      expect(result.idempotentReplay).toBe(true);
      expect(result.order.id).toBe(88);
      expect(mockOrderRepo.save).not.toHaveBeenCalled();
      expect(mockRabbitmqService.publishOrder).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on concurrent double-click while key is PROCESSING', async () => {
      mockCacheManager.get.mockResolvedValue({
        status: 'PROCESSING',
        updatedAt: Date.now(),
      });

      await expect(
        service.createOrder(1, 'key-in-flight', {
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '65000.00',
          quantity: '0.1',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create QUEUED LIMIT BUY order, lock quote currency (USDT) amount via BigNumber, and publish to RabbitMQ', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      const result = await service.createOrder(1, 'key-buy-01', {
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.50',
        quantity: '0.10000000',
      });

      expect(result.idempotentReplay).toBe(false);
      expect(result.order.status).toBe(OrderStatusEnum.QUEUED);
      expect(result.order.lockedCurrency).toBe(CurrencyEnum.USDT);
      expect(mockRabbitmqService.publishOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 101,
          userId: 1,
          idempotencyKey: 'key-buy-01',
          lockedCurrency: CurrencyEnum.USDT,
          requiredLockAmount: '6500.05000000',
        }),
      );
      expect(mockCacheManager.set).toHaveBeenLastCalledWith(
        'fintrade:idempotency:order:1:key-buy-01',
        expect.objectContaining({ status: 'COMPLETED', orderId: 101 }),
        { ttl: 120 },
      );
    });

    it('should create QUEUED LIMIT SELL order locking base currency (BTC) quantity', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);

      const result = await service.createOrder(1, 'key-sell-01', {
        symbol: 'BTCUSDT',
        side: OrderSideEnum.SELL,
        type: OrderTypeEnum.LIMIT,
        price: '70000.00',
        quantity: '0.25',
      });

      expect(result.order.lockedCurrency).toBe(CurrencyEnum.BTC);
      expect(mockRabbitmqService.publishOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          lockedCurrency: CurrencyEnum.BTC,
          requiredLockAmount: '0.25000000',
        }),
      );
    });

    it('should reject MARKET order with MARKET_DATA_STALE when Binance tick is stale (> 5s)', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      mockCandleAggregator.getLatestPrice.mockReturnValue({
        symbol: 'BTCUSDT',
        price: '65000.00',
        quantity: '0.5',
        timestamp: Date.now() - 10000, // 10 seconds old -> stale
        tradeId: 'T1',
        isBuyerMaker: false,
      });

      await expect(
        service.createOrder(1, 'key-market-stale', {
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.MARKET,
          quantity: '0.1',
        }),
      ).rejects.toThrow(BadRequestException);

      // Should release Redis lock so user can retry when market data recovers
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'fintrade:idempotency:order:1:key-market-stale',
      );
    });

    it('should rollback order and clear Redis lock when RabbitMQ is unavailable', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      mockRabbitmqService.publishOrder.mockResolvedValue(false);

      await expect(
        service.createOrder(1, 'key-rmq-down', {
          symbol: 'BTCUSDT',
          side: OrderSideEnum.BUY,
          type: OrderTypeEnum.LIMIT,
          price: '65000.00',
          quantity: '0.1',
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockOrderRepo.delete).toHaveBeenCalledWith({ id: 101 });
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'fintrade:idempotency:order:1:key-rmq-down',
      );
    });
  });

  describe('processQueuedOrder (RabbitMQ Consumer Worker)', () => {
    const queueMessage: OrderQueueMessage = {
      orderId: 101,
      userId: 1,
      idempotencyKey: 'key-buy-01',
      symbol: 'BTCUSDT',
      side: OrderSideEnum.BUY,
      type: OrderTypeEnum.LIMIT,
      price: '65000.00000000',
      quantity: '0.10000000',
      lockedCurrency: CurrencyEnum.USDT,
      requiredLockAmount: '6500.00000000',
      enqueuedAt: Date.now(),
    };

    it('should lock balance via AccountService, transition QUEUED -> PENDING, emit order.pending and ACK', async () => {
      const queuedOrder: Partial<Order> = {
        id: 101,
        userId: 1,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00000000',
        quantity: '0.10000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '0.00000000',
        status: OrderStatusEnum.QUEUED,
        rejectReason: null,
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(queuedOrder),
      });

      const ackResult = await service.processQueuedOrder(queueMessage);

      expect(ackResult).toBe('ACK');
      expect(mockAccountService.lockBalance).toHaveBeenCalledWith(
        1,
        CurrencyEnum.USDT,
        '6500.00000000',
        'ORDER-101',
        'TX-ORDER-LOCK-101',
        mockEntityManager,
      );
      expect(queuedOrder.status).toBe(OrderStatusEnum.PENDING);
      expect(queuedOrder.lockedAmount).toBe('6500.00000000');
      expect(mockRabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'order.pending',
          orderId: 101,
          status: OrderStatusEnum.PENDING,
        }),
      );
    });

    it('should mark order REJECTED and ACK (NOT dead-letter) when user balance is insufficient', async () => {
      const queuedOrder: Partial<Order> = {
        id: 101,
        userId: 1,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00000000',
        quantity: '0.10000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '0.00000000',
        status: OrderStatusEnum.QUEUED,
        rejectReason: null,
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(queuedOrder),
      });

      mockAccountService.lockBalance.mockRejectedValue(
        new BadRequestException('Số dư khả dụng không đủ'),
      );

      const ackResult = await service.processQueuedOrder(queueMessage);

      expect(ackResult).toBe('ACK');
      expect(queuedOrder.status).toBe(OrderStatusEnum.REJECTED);
      expect(queuedOrder.rejectReason).toContain('Số dư khả dụng không đủ');
      expect(mockRabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'order.rejected',
          orderId: 101,
          status: OrderStatusEnum.REJECTED,
        }),
      );
    });

    it('should return DEAD_LETTER on unexpected infrastructure error so RabbitMQ routes to orders.dlq', async () => {
      (mockDataSource.transaction as jest.Mock).mockRejectedValue(
        new Error('Connection terminated unexpectedly'),
      );

      const result = await service.processQueuedOrder(queueMessage);
      expect(result).toBe('DEAD_LETTER');
    });

    it('should idempotently ACK without double-locking if order is already PENDING', async () => {
      const pendingOrder: Partial<Order> = {
        id: 101,
        userId: 1,
        status: OrderStatusEnum.PENDING,
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(pendingOrder),
      });

      const ackResult = await service.processQueuedOrder(queueMessage);

      expect(ackResult).toBe('ACK');
      expect(mockAccountService.lockBalance).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('should cancel PENDING order and unlock remaining locked balance', async () => {
      const pendingOrder: Partial<Order> = {
        id: 101,
        userId: 1,
        symbol: 'BTCUSDT',
        side: OrderSideEnum.BUY,
        type: OrderTypeEnum.LIMIT,
        price: '65000.00000000',
        quantity: '0.10000000',
        lockedCurrency: CurrencyEnum.USDT,
        lockedAmount: '6500.00000000',
        status: OrderStatusEnum.PENDING,
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(pendingOrder),
      });

      const result = await service.cancelOrder(1, 101);

      expect(mockAccountService.unlockBalance).toHaveBeenCalledWith(
        1,
        CurrencyEnum.USDT,
        '6500.00000000',
        'ORDER-101',
        'TX-ORDER-UNLOCK-101',
        mockEntityManager,
      );
      expect(result.status).toBe(OrderStatusEnum.CANCELLED);
      expect(result.lockedAmount).toBe('0.00000000');
      expect(mockRabbitmqService.publishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'order.cancelled',
          orderId: 101,
        }),
      );
    });

    it('should throw BadRequestException when trying to cancel an already FILLED order', async () => {
      const filledOrder: Partial<Order> = {
        id: 101,
        userId: 1,
        status: OrderStatusEnum.FILLED,
        lockedAmount: '0.00000000',
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(filledOrder),
      });

      await expect(service.cancelOrder(1, 101)).rejects.toThrow(BadRequestException);
      expect(mockAccountService.unlockBalance).not.toHaveBeenCalled();
    });
  });
});
