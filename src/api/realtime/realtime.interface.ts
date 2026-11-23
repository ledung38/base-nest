export const CENTRIFUGO_CHANNELS = {
  ticks: (symbol: string) => `public:ticks:${symbol.toUpperCase()}`,
  orderbook: (symbol: string) => `public:orderbook:${symbol.toUpperCase()}`,
  trades: (symbol: string) => `public:trades:${symbol.toUpperCase()}`,
  candles: (symbol: string, interval: string) =>
    `public:candles:${symbol.toUpperCase()}:${interval}`,
  personal: (userId: number | string) => `personal:${userId}`,
};

export type RealtimeEventType =
  | 'TICK'
  | 'DEPTH'
  | 'TRADE_EXECUTED'
  | 'CANDLE'
  | 'ORDER_UPDATE'
  | 'BALANCE_UPDATE';

export interface CentrifugoPublishRequest {
  channel: string;
  data: any;
  b64data?: string;
  skip_history?: boolean;
}

export interface CentrifugoBroadcastRequest {
  channels: string[];
  data: any;
  b64data?: string;
  skip_history?: boolean;
}

export interface CentrifugoPublishResponse {
  result?: {
    offset?: number;
    epoch?: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface CentrifugoTokenResponse {
  token: string;
  wsUrl: string;
  userId: number;
  expiresIn: number;
}

export interface CentrifugoSubscriptionTokenResponse {
  token: string;
  channel: string;
  userId: number;
  expiresIn: number;
}

export interface RealtimeGatewayStatus {
  connected: boolean;
  apiUrl: string;
  wsUrl: string;
  totalPublished: number;
  totalErrors: number;
  lastPublishTimestamp: number | null;
  channels: {
    publicNamespaces: string[];
    personalNamespace: string;
  };
}
