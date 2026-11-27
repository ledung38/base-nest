import { CandleAggregatorService } from './candle-aggregator.service';
import { Candlestick, MarketTick } from './market.interface';

describe('CandleAggregatorService (1s Tick Aggregator & Exchange Kline Bridge)', () => {
  let service: CandleAggregatorService;

  beforeEach(() => {
    service = new CandleAggregatorService();
  });

  it('should initialize supported symbols correctly', () => {
    const symbols = service.getSupportedSymbols();
    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.symbol)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('should create a new active 1s candle on the first tick', () => {
    const baseTime = 1700000000000;
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
    // Chỉ tự gom nến 1s từ tick (1m..1d lấy trực tiếp từ Binance @kline)
    expect(updatedCandles).toHaveLength(1);

    const candle1s = updatedCandles[0];
    expect(candle1s.interval).toBe('1s');
    expect(candle1s.open).toBe('50000.00');
    expect(candle1s.high).toBe('50000.00');
    expect(candle1s.low).toBe('50000.00');
    expect(candle1s.close).toBe('50000.00');
    expect(candle1s.volume).toBe('1.50000000');
    expect(candle1s.tradesCount).toBe(1);
    expect(candle1s.isClosed).toBe(false);

    expect(service.getLatestPrice('BTCUSDT')).toEqual(tick);
  });

  it('should update high, low, close and volume for ticks within the same 1s window', () => {
    const baseTime = 1700000000000;

    service.processTick({
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.00000000',
      timestamp: baseTime + 100,
      tradeId: 'T1',
      isBuyerMaker: false,
    });
    service.processTick({
      symbol: 'BTCUSDT',
      price: '52000.00',
      quantity: '2.00000000',
      timestamp: baseTime + 400,
      tradeId: 'T2',
      isBuyerMaker: false,
    });
    service.processTick({
      symbol: 'BTCUSDT',
      price: '49000.00',
      quantity: '0.50000000',
      timestamp: baseTime + 800,
      tradeId: 'T3',
      isBuyerMaker: false,
    });

    const candles = service.getCandles('BTCUSDT', '1s', 10);
    expect(candles).toHaveLength(1);

    const current1s = candles[0];
    expect(current1s.open).toBe('50000.00');
    expect(current1s.high).toBe('52000.00000000');
    expect(current1s.low).toBe('49000.00000000');
    expect(current1s.close).toBe('49000.00');
    expect(current1s.volume).toBe('3.50000000');
    expect(current1s.tradesCount).toBe(3);
    expect(current1s.isClosed).toBe(false);
  });

  it('should close previous 1s candle when timestamp crosses 1s boundary', () => {
    const baseSec = 1700000000000;

    service.processTick({
      symbol: 'BTCUSDT',
      price: '50000.00',
      quantity: '1.00000000',
      timestamp: baseSec + 200,
      tradeId: 'T1',
      isBuyerMaker: false,
    });

    const { closedCandles } = service.processTick({
      symbol: 'BTCUSDT',
      price: '51000.00',
      quantity: '2.00000000',
      timestamp: baseSec + 1200,
      tradeId: 'T2',
      isBuyerMaker: false,
    });

    expect(closedCandles).toHaveLength(1);
    expect(closedCandles[0].interval).toBe('1s');
    expect(closedCandles[0].isClosed).toBe(true);
    expect(closedCandles[0].close).toBe('50000.00');

    const candles = service.getCandles('BTCUSDT', '1s', 10);
    expect(candles).toHaveLength(2);
    expect(candles[0].isClosed).toBe(true);
    expect(candles[1].isClosed).toBe(false);
    expect(candles[1].open).toBe('51000.00');
  });

  it('should track active exchange kline and emit to listeners when handleExchangeKline is called', () => {
    const received: Array<{ candle: Candlestick; isClosed: boolean }> = [];
    service.onCandle((candle, isClosed) => received.push({ candle, isClosed }));

    const active5m: Candlestick = {
      symbol: 'BTCUSDT',
      interval: '5m',
      openTime: 1700000100000,
      closeTime: 1700000399999,
      open: '65000.00',
      high: '65200.00',
      low: '64900.00',
      close: '65100.00',
      volume: '12.50000000',
      tradesCount: 150,
      isClosed: false,
    };

    service.handleExchangeKline(active5m);
    expect(service.getActiveCandle('BTCUSDT', '5m')).toEqual(active5m);
    expect(received).toHaveLength(1);
    expect(received[0].isClosed).toBe(false);

    const closed5m: Candlestick = { ...active5m, close: '65150.00', isClosed: true };
    service.handleExchangeKline(closed5m);
    expect(service.getActiveCandle('BTCUSDT', '5m')).toBeNull();
    expect(received).toHaveLength(2);
    expect(received[1].isClosed).toBe(true);
  });
});
