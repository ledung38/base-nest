import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import {
  CandleInterval,
  Candlestick,
  MarketSymbolInfo,
  MarketTick,
} from './market.interface';

@Injectable()
export class CandleAggregatorService {
  private readonly MAX_CANDLES_HISTORY = 500;
  // Chỉ tự gom nến 1s từ luồng @trade cho biểu đồ UI siêu mượt.
  // Các khung 1m, 5m, 15m, 1h, 1d lấy trực tiếp từ Binance @kline_<interval> & REST /api/v3/klines (khớp 1:1 với backtest).
  private readonly intervals: { interval: CandleInterval; ms: number }[] = [
    { interval: '1s', ms: 1000 },
  ];

  // Lưu trữ tick giá mới nhất của từng cặp coin
  private latestTicks = new Map<string, MarketTick>();

  // Lưu trữ nến đang chạy (active rolling candle): key = `${symbol}_${interval}`
  private activeCandles = new Map<string, Candlestick>();

  // Ring buffer lưu trữ lịch sử nến 1s đã hoàn thành: key = `${symbol}_1s`
  private candleHistory = new Map<string, Candlestick[]>();

  // Danh sách các cặp giao dịch được hỗ trợ
  private readonly supportedSymbols: MarketSymbolInfo[] = [
    {
      symbol: 'BTCUSDT',
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
      priceDecimals: 2,
      quantityDecimals: 5,
    },
    {
      symbol: 'ETHUSDT',
      baseCurrency: 'ETH',
      quoteCurrency: 'USDT',
      priceDecimals: 2,
      quantityDecimals: 4,
    },
    {
      symbol: 'SOLUSDT',
      baseCurrency: 'SOL',
      quoteCurrency: 'USDT',
      priceDecimals: 2,
      quantityDecimals: 3,
    },
  ];

  // Callback listeners khi có tick mới (cho Matching Engine, Centrifugo broadcast)
  private readonly tickListeners: ((tick: MarketTick) => void)[] = [];

  // Callback listeners khi có nến mới/đóng nến (cho Centrifugo, TradingView charts)
  private readonly candleListeners: ((
    candle: Candlestick,
    isClosed: boolean,
  ) => void)[] = [];

  /**
   * Đăng ký callback nhận luồng tick thời gian thực
   */
  onTick(listener: (tick: MarketTick) => void): void {
    this.tickListeners.push(listener);
  }

  /**
   * Đăng ký callback nhận nến được cập nhật hoặc đóng nến
   */
  onCandle(listener: (candle: Candlestick, isClosed: boolean) => void): void {
    this.candleListeners.push(listener);
  }

  /**
   * Tiếp nhận bản tin kline trực tiếp từ Binance WebSocket (@kline_1m, 5m, 15m, 1h, 1d)
   * để cập nhật active candle cho chart UI và phát sự kiện tới các listeners (Centrifugo).
   */
  handleExchangeKline(candle: Candlestick): void {
    const key = `${candle.symbol.toUpperCase()}_${candle.interval}`;
    if (candle.isClosed) {
      const current = this.activeCandles.get(key);
      if (current && current.openTime === candle.openTime) {
        this.activeCandles.delete(key);
      }
    } else {
      this.activeCandles.set(key, candle);
    }

    this.notifyCandleListeners(candle, candle.isClosed);
  }

  /**
   * Xử lý một tick giá mới nhận được từ Binance @trade:
   * - Cập nhật latestTicks
   * - Phát sự kiện onTick (Matching Engine, Centrifugo)
   * - Gom nến 1s in-memory cho biểu đồ realtime UI
   */
  processTick(tick: MarketTick): {
    updatedCandles: Candlestick[];
    closedCandles: Candlestick[];
  } {
    const symbol = tick.symbol.toUpperCase();
    this.latestTicks.set(symbol, tick);

    for (const listener of this.tickListeners) {
      try {
        listener(tick);
      } catch (err) {
        // Tránh lỗi listener ảnh hưởng tới luồng gom nến
      }
    }

    const updatedCandles: Candlestick[] = [];
    const closedCandles: Candlestick[] = [];

    const tickPriceBN = new BigNumber(tick.price);
    const tickQtyBN = new BigNumber(tick.quantity);

    for (const { interval, ms } of this.intervals) {
      const key = `${symbol}_${interval}`;
      const windowOpenTime = Math.floor(tick.timestamp / ms) * ms;
      const windowCloseTime = windowOpenTime + ms;

      const currentCandle = this.activeCandles.get(key);

      if (!currentCandle || tick.timestamp >= currentCandle.closeTime) {
        if (currentCandle) {
          const closed = { ...currentCandle, isClosed: true };
          closedCandles.push(closed);
          this.archiveCandle(key, closed);
        }

        const newCandle: Candlestick = {
          symbol,
          interval,
          openTime: windowOpenTime,
          closeTime: windowCloseTime,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tickQtyBN.toFixed(8),
          tradesCount: 1,
          isClosed: false,
        };

        this.activeCandles.set(key, newCandle);
        updatedCandles.push(newCandle);
      } else {
        const highBN = BigNumber.max(currentCandle.high, tickPriceBN);
        const lowBN = BigNumber.min(currentCandle.low, tickPriceBN);
        const volumeBN = new BigNumber(currentCandle.volume).plus(tickQtyBN);

        currentCandle.high = highBN.toFixed(8);
        currentCandle.low = lowBN.toFixed(8);
        currentCandle.close = tick.price;
        currentCandle.volume = volumeBN.toFixed(8);
        currentCandle.tradesCount += 1;

        updatedCandles.push({ ...currentCandle });
      }
    }

    for (const c of closedCandles) {
      this.notifyCandleListeners(c, true);
    }

    for (const c of updatedCandles) {
      this.notifyCandleListeners(c, false);
    }

    return { updatedCandles, closedCandles };
  }

  private notifyCandleListeners(candle: Candlestick, isClosed: boolean): void {
    for (const listener of this.candleListeners) {
      try {
        listener(candle, isClosed);
      } catch (err) {
        // Tránh lỗi listener ảnh hưởng tới tiến trình
      }
    }
  }

  /**
   * Lưu nến 1s đã đóng vào Ring Buffer (giới hạn 500 nến mới nhất)
   */
  private archiveCandle(key: string, candle: Candlestick) {
    let history = this.candleHistory.get(key);
    if (!history) {
      history = [];
      this.candleHistory.set(key, history);
    }

    history.push(candle);
    if (history.length > this.MAX_CANDLES_HISTORY) {
      history.shift();
    }
  }

  /**
   * Lấy cây nến đang chạy (chưa đóng) của một (symbol, interval) cho UI chart
   */
  getActiveCandle(symbol: string, interval: CandleInterval): Candlestick | null {
    return this.activeCandles.get(`${symbol.toUpperCase()}_${interval}`) || null;
  }

  /**
   * Lấy giá và tick mới nhất của một symbol
   */
  getLatestPrice(symbol: string): MarketTick | null {
    return this.latestTicks.get(symbol.toUpperCase()) || null;
  }

  /**
   * Lấy toàn bộ giá mới nhất của các cặp tiền
   */
  getAllLatestPrices(): Record<string, MarketTick> {
    const result: Record<string, MarketTick> = {};
    for (const [sym, tick] of this.latestTicks.entries()) {
      result[sym] = tick;
    }
    return result;
  }

  /**
   * Lấy danh sách nến 1s từ RAM để vẽ biểu đồ realtime UI
   */
  getCandles(
    symbol: string,
    interval: CandleInterval = '1s',
    limit = 100,
  ): Candlestick[] {
    const key = `${symbol.toUpperCase()}_${interval}`;
    const history = this.candleHistory.get(key) || [];
    const active = this.activeCandles.get(key);

    const merged = active ? [...history, active] : [...history];
    const takeLimit = Math.min(Math.max(limit, 1), this.MAX_CANDLES_HISTORY);

    return merged.slice(-takeLimit);
  }

  /**
   * Lấy danh sách các cặp tiền được hệ thống hỗ trợ
   */
  getSupportedSymbols(): MarketSymbolInfo[] {
    return this.supportedSymbols;
  }
}
