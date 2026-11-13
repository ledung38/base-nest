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
  private readonly intervals: { interval: CandleInterval; ms: number }[] = [
    { interval: '1s', ms: 1000 },
    { interval: '1m', ms: 60 * 1000 },
    { interval: '15m', ms: 15 * 60 * 1000 },
  ];

  // Lưu trữ tick giá mới nhất của từng cặp coin
  private latestTicks = new Map<string, MarketTick>();

  // Lưu trữ nến đang chạy (active rolling candle): key = `${symbol}_${interval}`
  private activeCandles = new Map<string, Candlestick>();

  // Ring buffer lưu trữ lịch sử nến đã hoàn thành: key = `${symbol}_${interval}`
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

  /**
   * Xử lý một tick giá mới nhận được từ Binance/Kafka
   * Cập nhật hoặc đóng nến OHLCV theo thời gian thực
   */
  processTick(tick: MarketTick): {
    updatedCandles: Candlestick[];
    closedCandles: Candlestick[];
  } {
    const symbol = tick.symbol.toUpperCase();
    this.latestTicks.set(symbol, tick);

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
        // Nếu nến cũ đã hết khung thời gian -> Đóng nến cũ
        if (currentCandle) {
          const closed = { ...currentCandle, isClosed: true };
          closedCandles.push(closed);
          this.archiveCandle(key, closed);
        }

        // Khởi tạo cây nến mới
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
        // Cập nhật cây nến hiện tại trong khung thời gian
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

    return { updatedCandles, closedCandles };
  }

  /**
   * Lưu nến đã đóng vào Ring Buffer (giới hạn 500 nến mới nhất)
   */
  private archiveCandle(key: string, candle: Candlestick) {
    let history = this.candleHistory.get(key);
    if (!history) {
      history = [];
      this.candleHistory.set(key, history);
    }

    history.push(candle);
    if (history.length > this.MAX_CANDLES_HISTORY) {
      history.shift(); // Loại bỏ nến cũ nhất để tránh leak memory
    }
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
   * Lấy danh sách nến để vẽ biểu đồ TradingView / Lightweight Charts
   */
  getCandles(
    symbol: string,
    interval: CandleInterval = '1m',
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

