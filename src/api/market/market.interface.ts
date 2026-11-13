export interface MarketTick {
  symbol: string;        // e.g. 'BTCUSDT'
  price: string;         // e.g. '68500.25'
  quantity: string;      // e.g. '0.04500000'
  timestamp: number;     // epoch ms
  tradeId: string;       // e.g. '123456789'
  isBuyerMaker: boolean; // true: Sell order triggered, false: Buy order triggered
}

export type CandleInterval = '1s' | '1m' | '15m';

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

