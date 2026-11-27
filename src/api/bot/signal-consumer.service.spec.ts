import { BadRequestException } from '@nestjs/common';
import {
  BotTypeEnum,
  OrderSideEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { BotConfig } from 'src/entities/bot-config.entity';
import { TradingSignalPayload } from './bot.interface';
import { SignalConsumerService } from './signal-consumer.service';

describe('SignalConsumerService (Python Alpha Signal -> NestJS Execution)', () => {
  let service: SignalConsumerService;
  let mockBotRepo: any;
  let mockOrderService: any;

  const makeBot = (overrides: Partial<BotConfig> = {}): BotConfig =>
    ({
      id: 7,
      userId: 10,
      name: 'BTC Alpha 5m',
      botType: BotTypeEnum.ALPHA_SIGNAL,
      symbol: 'BTCUSDT',
      parameters: {
        strategyCode: 'ALPHA_CONFLUENCE_01',
        candleInterval: '5m',
        orderQuantity: '0.02000000',
      },
      isActive: true,
      realizedPnl: '0.00000000',
      totalTradesCount: 0,
      lastSignal: null,
      lastRunAt: null,
      ...overrides,
    }) as unknown as BotConfig;

  const makeSignal = (
    overrides: Partial<TradingSignalPayload> = {},
  ): TradingSignalPayload => {
    const now = 1795478701000;
    return {
      signalId: 'ALPHA_CONFLUENCE_01:BTCUSDT:5m:1795478400000',
      strategyCode: 'ALPHA_CONFLUENCE_01',
      symbol: 'BTCUSDT',
      interval: '5m',
      candleOpenTime: 1795478400000,
      candleCloseTime: now - 1500, // 1.5s latency
      action: 1,
      refPrice: '68700.00',
      generatedAt: now - 200,
      ...overrides,
    };
  };

  beforeEach(() => {
    mockBotRepo = {
      findOne: jest.fn().mockResolvedValue(makeBot()),
      save: jest.fn().mockImplementation((b) => Promise.resolve(b)),
    };

    mockOrderService = {
      createOrder: jest.fn().mockResolvedValue({
        order: { id: 999 },
        idempotentReplay: false,
      }),
    };

    service = new SignalConsumerService(mockBotRepo, mockOrderService);
  });

  it('should NACK malformed signal payloads to route them to DLQ', async () => {
    const res = await service.handleSignal({ bad: 'payload' });
    expect(res).toBe('NACK');
    expect(mockOrderService.createOrder).not.toHaveBeenCalled();
  });

  it('should ACK and execute MARKET BUY with exact (userId, idempotencyKey <= 64 chars, dto) order', async () => {
    await service.startBot(makeBot());
    const signal = makeSignal({ action: 1 });
    const now = signal.candleCloseTime + 1500;

    const res = await service.handleSignal(signal, now);

    expect(res).toBe('ACK');
    expect(mockOrderService.createOrder).toHaveBeenCalledTimes(1);

    const [userId, idempotencyKey, dto] = mockOrderService.createOrder.mock.calls[0];
    expect(userId).toBe(10);
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeLessThanOrEqual(64);
    expect(idempotencyKey).toBe(service.buildIdempotencyKey(7, signal.signalId));
    expect(dto).toEqual({
      symbol: 'BTCUSDT',
      side: OrderSideEnum.BUY,
      type: OrderTypeEnum.MARKET,
      quantity: '0.02000000',
    });

    // Tín hiệu lặp cùng hướng BUY kế tiếp phải bị bỏ qua
    const resDup = await service.handleSignal(
      makeSignal({ signalId: 'ALPHA_CONFLUENCE_01:BTCUSDT:5m:1795478700000', action: 1 }),
      now,
    );
    expect(resDup).toBe('ACK');
    expect(mockOrderService.createOrder).toHaveBeenCalledTimes(1);

    // Đảo chiều sang SELL (-1) phải đặt lệnh MARKET SELL
    const resSell = await service.handleSignal(
      makeSignal({ signalId: 'ALPHA_CONFLUENCE_01:BTCUSDT:5m:1795479000000', action: -1 }),
      now,
    );
    expect(resSell).toBe('ACK');
    expect(mockOrderService.createOrder).toHaveBeenCalledTimes(2);
    expect(mockOrderService.createOrder.mock.calls[1][2].side).toBe(OrderSideEnum.SELL);
  });

  it('should ignore stale signals older than maxStalenessMs', async () => {
    await service.startBot(makeBot());
    const signal = makeSignal();
    const staleNow = signal.candleCloseTime + 45_000; // > 30s default for 5m

    const res = await service.handleSignal(signal, staleNow);

    expect(res).toBe('ACK');
    expect(mockOrderService.createOrder).not.toHaveBeenCalled();
    expect(service.getStatus().totalSkippedStale).toBe(1);
  });

  it('should ACK and isolate insufficient balance errors without poisoning the queue', async () => {
    await service.startBot(makeBot());
    mockOrderService.createOrder.mockRejectedValueOnce(
      new BadRequestException('INSUFFICIENT_AVAILABLE_BALANCE'),
    );

    const signal = makeSignal();
    const res = await service.handleSignal(signal, signal.candleCloseTime + 1000);

    expect(res).toBe('ACK');
    expect(service.getStatus().totalOrderErrors).toBe(1);
    expect(service.getStatus().totalOrdersTriggered).toBe(0);
  });

  it('should ACK action=0 without calling createOrder', async () => {
    await service.startBot(makeBot());
    const signal = makeSignal({ action: 0 });
    const res = await service.handleSignal(signal, signal.candleCloseTime + 500);

    expect(res).toBe('ACK');
    expect(mockOrderService.createOrder).not.toHaveBeenCalled();
  });
});
