import { BinanceRestService } from './binance-rest.service';

describe('BinanceRestService (Historical Klines Client)', () => {
  let service: BinanceRestService;
  let mockHttpGet: jest.Mock;

  beforeEach(() => {
    service = new BinanceRestService();
    mockHttpGet = jest.fn();
    (service as any).http = { get: mockHttpGet };
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
  });

  it('should parse raw Binance klines, drop unclosed bar, and record used weight header', async () => {
    const now = Date.now();
    const closedRow = [
      now - 600_000,
      '65000.00',
      '65500.00',
      '64800.00',
      '65200.00',
      '120.50',
      now - 300_001,
      '7800000',
      310,
      '60',
      '3900000',
      '0',
    ];
    const openRow = [
      now - 60_000,
      '65200.00',
      '65300.00',
      '65100.00',
      '65250.00',
      '15.00',
      now + 240_000, // chưa đóng
      '970000',
      40,
      '8',
      '500000',
      '0',
    ];

    mockHttpGet.mockResolvedValue({
      data: [closedRow, openRow],
      headers: { 'x-mbx-used-weight-1m': '42' },
    });

    const candles = await service.fetchKlines({
      symbol: 'btcusdt',
      interval: '5m',
      limit: 1000,
    });

    expect(candles).toHaveLength(1);
    expect(candles[0].symbol).toBe('BTCUSDT');
    expect(candles[0].interval).toBe('5m');
    expect(candles[0].close).toBe('65200.00');
    expect(candles[0].isClosed).toBe(true);
    expect(service.getLastUsedWeight1m()).toBe(42);
  });

  it('should retry with backoff on HTTP 429 rate limit and succeed', async () => {
    const now = Date.now();
    const rateLimitError = {
      response: {
        status: 429,
        headers: { 'retry-after': '1' },
      },
    };
    const closedRow = [
      now - 600_000,
      '65000',
      '65100',
      '64900',
      '65050',
      '10',
      now - 300_001,
      '0',
      20,
      '0',
      '0',
      '0',
    ];

    mockHttpGet
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        data: [closedRow],
        headers: { 'x-mbx-used-weight-1m': '10' },
      });

    const candles = await service.fetchKlines({
      symbol: 'BTCUSDT',
      interval: '5m',
    });

    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    expect((service as any).sleep).toHaveBeenCalledWith(1000);
    expect(candles).toHaveLength(1);
  });

  it('should paginate across multiple batches in fetchKlinesRange', async () => {
    const step = 5 * 60 * 1000;
    const baseOpen = 1700000000000;

    const makeBatch = (startIdx: number, count: number) =>
      Array.from({ length: count }, (_, i) => [
        baseOpen + (startIdx + i) * step,
        '60000',
        '60100',
        '59900',
        '60050',
        '5',
        baseOpen + (startIdx + i + 1) * step - 1,
        '0',
        10,
        '0',
        '0',
        '0',
      ]);

    mockHttpGet
      .mockResolvedValueOnce({ data: makeBatch(0, 1000), headers: {} })
      .mockResolvedValueOnce({ data: makeBatch(1000, 250), headers: {} });

    const all = await service.fetchKlinesRange(
      'BTCUSDT',
      '5m',
      baseOpen,
      baseOpen + 1300 * step,
    );

    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    expect(all).toHaveLength(1250);
    expect(all[0].openTime).toBe(baseOpen);
    expect(all[1249].openTime).toBe(baseOpen + 1249 * step);
  });
});
