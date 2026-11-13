import { CandleAggregatorService } from './candle-aggregator.service';
import { MarketTick } from './market.interface';

describe('CandleAggregatorService (OHLCV Rolling Aggregator)', () => {
  let service: CandleAggregatorService;

  beforeEach(() => {
    service = new CandleAggregatorService();
  });

  it('should initialize supported symbols correctly', () => {
    const symbols = service.getSupportedSymbols();
    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('should create a new active candle on the first tick', () => {
    const baseTime = 1700000000000; // Epoch ms
    const tick: MarketTick = {
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.50000000',
      timestamp: baseTime,
      tradeId: 'T1',
      isBuyerMaker: false,
    };

    const { updatedCandles, closedCandles } = service.processTick(tick);

    expect(closedCandles).toHaveLength(0);
    // 3 intervals: 1s, 1m, 15m
    expect(updatedCandles).toHaveLength(3);

    const candle1m = updatedCandles.find((c) => c.interval === '1m');
    expect(candle1m).toBeDefined();
    expect(candle1m?.open).toBe('50000.00');
    expect(candle1m?.high).toBe('50000.00');
    expect(candle1m?.low).toBe('50000.00');
    expect(candle1m?.close).toBe('50000.00');
    expect(candle1m?.volume).toBe('1.50000000');
    expect(candle1m?.tradesCount).toBe(1);
    expect(candle1m?.isClosed).toBe(false);

    expect(service.getLatestPrice('BTCUSDT')).toEqual(tick);
  });

  it('should update high, low, close and volume for ticks within the same candle window', () => {
    const baseTime = 1700000000000;

    // Tick 1: Open at 50,000
    service.processTick({
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.00000000',
      timestamp: baseTime,
      tradeId: 'T1',
      isBuyerMaker: false,
    });

    // Tick 2: Higher price at 52,000 (10s later in same 1m window)
    service.processTick({
      symbol: 'BTCUSDT',
      price: '52000.00',
      quantity: '2.00000000',
      timestamp: baseTime + 10000,
      tradeId: 'T2',
      isBuyerMaker: false,
    });

    // Tick 3: Lower price at 49,000 (20s later in same 1m window)
    service.processTick({
      symbol: 'BTCUSDT',
      price: '49000.00',
      quantity: '0.50000000',
      timestamp: baseTime + 20000,
      tradeId: 'T3',
      isBuyerMaker: false,
    });

    const candles = service.getCandles('BTCUSDT', '1m', 10);
    expect(candles).toHaveLength(1);

    const current1m = candles[0];
    expect(current1m.open).toBe('50000.00');
    expect(current1m.high).toBe('52000.00000000');
    expect(current1m.low).toBe('49000.00000000');
    expect(current1m.close).toBe('49000.00');
    expect(current1m.volume).toBe('3.50000000');
    expect(current1m.tradesCount).toBe(3);
    expect(current1m.isClosed).toBe(false);
  });

  it('should close the previous candle and start a new one when timestamp crosses window boundary', () => {
    // Round to clean minute
    const baseTime = 1700000040000; // e.g. 10:00:40
    const minuteStart = Math.floor(baseTime / 60000) * 60000;

    service.processTick({
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.00000000',
      timestamp: minuteStart + 10000, // 10:00:10
      tradeId: 'T1',
      isBuyerMaker: false,
    });

    // Next tick in the NEXT minute (e.g. 10:01:05)
    const nextMinuteTick: MarketTick = {
      symbol: 'BTCUSDT',
      price: '51000.00',
      quantity: '2.00000000',
      timestamp: minuteStart + 65000, // 10:01:05
      tradeId: 'T2',
      isBuyerMaker: false,
    };

    const { closedCandles } = service.processTick(nextMinuteTick);

    const closed1m = closedCandles.find((c) => c.interval === '1m');
    expect(closed1m).toBeDefined();
    expect(closed1m?.isClosed).toBe(true);
    expect(closed1m?.open).toBe('50000.00');
    expect(closed1m?.close).toBe('50000.00');

    // Total candles should now be 2: 1 archived closed + 1 active
    const candles = service.getCandles('BTCUSDT', '1m', 10);
    expect(candles).toHaveLength(2);
    expect(candles[0].isClosed).toBe(true);
    expect(candles[1].isClosed).toBe(false);
    expect(candles[1].open).toBe('51000.00');
  });
});

