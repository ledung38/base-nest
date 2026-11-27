import { CandleStoreService } from './candle-store.service';
import { Candlestick } from './market.interface';

describe('CandleStoreService (2-Tier RAM Ring Buffer + PostgreSQL Store)', () => {
  let service: CandleStoreService;
  let mockQueryBuilder: any;
  let mockRepo: any;

  const makeClosed = (openTime: number, close = '65000.00'): Candlestick => ({
    symbol: 'BTCUSDT',
    interval: '5m',
    openTime,
    closeTime: openTime + 300_000 - 1,
    open: '64900.00',
    high: '65100.00',
    low: '64800.00',
    close,
    volume: '10.00000000',
    tradesCount: 25,
    isClosed: true,
  });

  beforeEach(() => {
    mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ maxOpenTime: null }),
    };

    mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    service = new CandleStoreService(mockRepo);
  });

  it('should reject unclosed candles (isClosed = false)', async () => {
    const unclosed = { ...makeClosed(1700000000000), isClosed: false };
    const saved = await service.saveClosedCandle(unclosed);

    expect(saved).toBe(false);
    expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('should deduplicate by openTime, keep ascending order, and cap RAM buffer at 1000', async () => {
    const batch: Candlestick[] = [];
    for (let i = 0; i < 1050; i++) {
      batch.push(makeClosed(1700000000000 + i * 300_000, `${60000 + i}.00`));
    }
    // Thêm 1 bản sao trùng openTime
    batch.push(makeClosed(1700000000000 + 1049 * 300_000, '99999.00'));

    await service.saveClosedCandlesBatch(batch);

    const candles = await service.getClosedCandles('BTCUSDT', '5m', 1000);
    expect(candles).toHaveLength(1000);
    expect(candles[0].openTime).toBe(1700000000000 + 50 * 300_000);
    expect(candles[999].close).toBe('99999.00000000');

    // Fast path đọc từ RAM không cần truy vấn DB getMany
    expect(mockQueryBuilder.getMany).not.toHaveBeenCalled();
  });

  it('should return false when saving a duplicate openTime candle', async () => {
    const c1 = makeClosed(1700000000000, '65000.00');
    const first = await service.saveClosedCandle(c1);
    const second = await service.saveClosedCandle({ ...c1, close: '65010.00' });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('should fallback to PostgreSQL when querying endTime older than RAM buffer', async () => {
    await service.saveClosedCandle(makeClosed(1700000600000));

    mockQueryBuilder.getMany.mockResolvedValue([
      {
        symbol: 'BTCUSDT',
        interval: '5m',
        openTime: '1700000000000',
        closeTime: '1700000299999',
        open: '64000.00000000',
        high: '64100.00000000',
        low: '63900.00000000',
        close: '64050.00000000',
        volume: '5.00000000',
        tradesCount: 12,
      },
    ]);

    const historical = await service.getClosedCandles(
      'BTCUSDT',
      '5m',
      10,
      1700000300000,
    );

    expect(mockQueryBuilder.getMany).toHaveBeenCalledTimes(1);
    expect(historical).toHaveLength(1);
    expect(historical[0].openTime).toBe(1700000000000);
    expect(historical[0].isClosed).toBe(true);
  });
});
