export interface MarketTick {
  symbol: string;        // e.g. 'BTCUSDT'
  price: string;         // e.g. '68500.25'
  quantity: string;      // e.g. '0.04500000'
  timestamp: number;     // epoch ms
  tradeId: string;       // e.g. '123456789'
  isBuyerMaker: boolean; // true: Sell order triggered, false: Buy order triggered
}

export type KlineInterval = '1m' | '5m' | '15m' | '1h' | '1d';
export type CandleInterval = '1s' | KlineInterval;

export const KLINE_INTERVALS: KlineInterval[] = ['1m', '5m', '15m', '1h', '1d'];

export const KLINE_INTERVAL_MS: Record<KlineInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

export interface Candlestick {
  symbol: string;
  interval: CandleInterval;
  openTime: number;      // Epoch ms mở nến
  closeTime: number;     // Epoch ms đóng nến
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  tradesCount: number;
  isClosed: boolean;
}

export interface MarketSymbolInfo {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  priceDecimals: number;
  quantityDecimals: number;
}
