import { KlineBackfillService } from './kline-backfill.service';
import { Candlestick } from './market.interface';

describe('KlineBackfillService (Warm-up & Gap Patch)', () => {
  let service: KlineBackfillService;
  let mockRest: any;
  let mockStore: any;

  const sampleCandle = (openTime: number): Candlestick => ({
    symbol: 'BTCUSDT',
    interval: '5m',
    openTime,
    closeTime: openTime + 300_000 - 1,
    open: '65000',
    high: '65100',
    low: '64900',
    close: '65050',
    volume: '10',
    tradesCount: 20,
    isClosed: true,
  });

  beforeEach(() => {
    mockRest = {
      fetchKlines: jest.fn().mockResolvedValue([]),
      fetchKlinesRange: jest.fn().mockResolvedValue([]),
      getLastUsedWeight1m: jest.fn().mockReturnValue(2),
    };

    mockStore = {
      loadBufferFromDb: jest.fn().mockResolvedValue(0),
      getLatestOpenTime: jest.fn().mockResolvedValue(null),
      saveClosedCandlesBatch: jest
        .fn()
        .mockImplementation((arr: Candlestick[]) => Promise.resolve(arr.length)),
    };

    service = new KlineBackfillService(mockRest, mockStore);
  });

  it('should fetch 1000 warmup candles when DB is empty', async () => {
    const fetched = [sampleCandle(1700000000000), sampleCandle(1700000300000)];
    mockRest.fetchKlines.mockResolvedValue(fetched);

    const saved = await service.warmUpSymbolInterval('BTCUSDT', '5m', 1000);

    expect(mockRest.fetchKlines).toHaveBeenCalledWith({
      symbol: 'BTCUSDT',
      interval: '5m',
      limit: 1000,
      closedOnly: true,
    });
    expect(mockStore.saveClosedCandlesBatch).toHaveBeenCalledWith(fetched);
    expect(saved).toBe(2);
  });

  it('should backfill missing gap using fetchKlinesRange when DB has full warmup but is behind now', async () => {
    const step = 5 * 60 * 1000;
    const latestOpen = Date.now() - 4 * step;
    mockStore.loadBufferFromDb.mockResolvedValue(1000);
    mockStore.getLatestOpenTime.mockResolvedValue(latestOpen);

    const gapCandles = [sampleCandle(latestOpen + step), sampleCandle(latestOpen + 2 * step)];
    mockRest.fetchKlinesRange.mockResolvedValue(gapCandles);

    const saved = await service.warmUpSymbolInterval('BTCUSDT', '5m', 1000);

    expect(mockRest.fetchKlines).not.toHaveBeenCalled();
    expect(mockRest.fetchKlinesRange).toHaveBeenCalledWith(
      'BTCUSDT',
      '5m',
      latestOpen + step,
      expect.any(Number),
    );
    expect(saved).toBe(2);
  });

  it('should skip REST call when DB buffer is already up to date', async () => {
    const step = 5 * 60 * 1000;
    const latestOpen = Date.now() - step - 10_000; // chỉ mới qua 10s của nến hiện tại (chưa đóng)
    mockStore.loadBufferFromDb.mockResolvedValue(1000);
    mockStore.getLatestOpenTime.mockResolvedValue(latestOpen);

    const saved = await service.warmUpSymbolInterval('BTCUSDT', '5m', 1000);

    expect(mockRest.fetchKlines).not.toHaveBeenCalled();
    expect(mockRest.fetchKlinesRange).not.toHaveBeenCalled();
    expect(saved).toBe(0);
  });
});
