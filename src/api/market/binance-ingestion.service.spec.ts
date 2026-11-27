import { BinanceIngestionService } from './binance-ingestion.service';

describe('BinanceIngestionService (@trade & @kline_<interval> Combined Stream)', () => {
  let service: BinanceIngestionService;
  let mockAggregator: any;
  let mockStore: any;
  let mockBackfill: any;
  let mockKafka: any;

  beforeEach(() => {
    mockAggregator = {
      processTick: jest.fn().mockReturnValue({ updatedCandles: [], closedCandles: [] }),
      handleExchangeKline: jest.fn(),
    };
    mockStore = {
      saveClosedCandle: jest.fn().mockResolvedValue(true),
    };
    mockBackfill = {
      getConfiguredIntervals: jest.fn().mockReturnValue(['1m', '5m', '15m', '1h', '1d']),
      backfillGapsAll: jest.fn().mockResolvedValue(0),
    };
    mockKafka = {
      sendTick: jest.fn().mockResolvedValue(undefined),
      sendCandle: jest.fn().mockResolvedValue(undefined),
    };

    service = new BinanceIngestionService(
      mockAggregator,
      mockStore,
      mockBackfill,
      mockKafka,
    );
  });

  it('should subscribe to @trade and all 5 @kline intervals for each symbol', () => {
    const streams = service.buildSubscribedStreams();
    expect(streams).toContain('btcusdt@trade');
    expect(streams).toContain('btcusdt@kline_1m');
    expect(streams).toContain('btcusdt@kline_5m');
    expect(streams).toContain('btcusdt@kline_15m');
    expect(streams).toContain('btcusdt@kline_1h');
    expect(streams).toContain('btcusdt@kline_1d');
  });

  it('should ignore Kafka/DB persistence when kline is still open (k.x = false)', () => {
    const msg = JSON.stringify({
      stream: 'btcusdt@kline_5m',
      data: {
        e: 'kline',
        k: {
          t: 1700000100000,
          T: 1700000399999,
          s: 'BTCUSDT',
          i: '5m',
          o: '65000.00',
          h: '65100.00',
          l: '64900.00',
          c: '65050.00',
          v: '12.34',
          n: 120,
          x: false,
        },
      },
    });

    service.handleMessage(Buffer.from(msg));

    expect(mockAggregator.handleExchangeKline).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'BTCUSDT', interval: '5m', isClosed: false }),
    );
    expect(mockKafka.sendCandle).not.toHaveBeenCalled();
    expect(mockStore.saveClosedCandle).not.toHaveBeenCalled();
  });

  it('should publish to Kafka, persist to CandleStore, and record latency when kline closes (k.x = true)', () => {
    const closeTime = Date.now() - 450;
    const msg = JSON.stringify({
      stream: 'btcusdt@kline_5m',
      data: {
        e: 'kline',
        k: {
          t: closeTime - 299_999,
          T: closeTime,
          s: 'BTCUSDT',
          i: '5m',
          o: '65000.00',
          h: '65200.00',
          l: '64950.00',
          c: '65180.00',
          v: '55.00',
          n: 300,
          x: true,
        },
      },
    });

    service.handleMessage(Buffer.from(msg));

    expect(mockKafka.sendCandle).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTCUSDT',
        interval: '5m',
        close: '65180.00',
        isClosed: true,
      }),
    );
    expect(mockStore.saveClosedCandle).toHaveBeenCalledTimes(1);

    const status = service.getStatus();
    expect(status.totalClosedKlinesReceived).toBe(1);
    expect(status.lastKlineLatencyMs).toBeGreaterThanOrEqual(400);
  });
});
