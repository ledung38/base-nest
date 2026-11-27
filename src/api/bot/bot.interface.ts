import { KlineInterval } from 'src/api/market/market.interface';
import { BotTypeEnum, OrderSideEnum } from 'src/constant/trading.enum';

export interface GridParameters {
  lowerPrice: string;       // Mức giá sàn dưới của lưới (ví dụ: '60000.00')
  upperPrice: string;       // Mức giá trần trên của lưới (ví dụ: '70000.00')
  gridLevels: number;       // Số mức lưới chia đều (ví dụ: 5 tầng)
  quantityPerGrid: string;  // Khối lượng đặt cho mỗi mức (ví dụ: '0.01000000')
}

export interface AlphaSignalParameters {
  strategyCode: string;           // Mã chiến lược Python phát ra (vd: 'ALPHA_CONFLUENCE_01')
  candleInterval: KlineInterval;  // Khung thời gian đăng ký (vd: '5m')
  orderQuantity: string;          // Khối lượng đặt mỗi lần có tín hiệu (BigNumber string)
  maxStalenessMs?: number;        // Ngưỡng loại bỏ tín hiệu cũ (tùy chọn, mặc định theo interval)
}

/**
 * Hợp đồng tín hiệu từ Python Quant Worker đẩy vào RabbitMQ queue `trading.signals`.
 * Python chỉ quyết định hướng (1 = BUY, -1 = SELL, 0 = bỏ qua);
 * toàn bộ tính toán khối lượng, khóa tiền, rủi ro thực hiện ở NestJS bằng BigNumber.
 */
export interface TradingSignalPayload {
  signalId: string;           // Deterministic: `${strategyCode}:${symbol}:${interval}:${candleOpenTime}`
  strategyCode: string;       // Ví dụ: 'ALPHA_CONFLUENCE_01'
  symbol: string;             // Ví dụ: 'BTCUSDT'
  interval: KlineInterval;    // '1m' | '5m' | '15m' | '1h' | '1d'
  candleOpenTime: number;     // Epoch ms mở nến
  candleCloseTime: number;    // Epoch ms đóng nến
  action: 1 | -1 | 0;         // 1 = BUY, -1 = SELL, 0 = HOLD (ignored)
  refPrice: string;           // Giá đóng cửa tham chiếu
  generatedAt: number;        // Epoch ms thời điểm Python tính xong tín hiệu
}

export type GridLevelStatus = 'IDLE' | 'BUY_PLACED' | 'BOUGHT' | 'SELL_PLACED';

export interface GridLevelState {
  index: number;
  price: string;
  status: GridLevelStatus;
  activeOrderId?: number;
  orderSide?: OrderSideEnum;
}

export interface BotRuntimeState {
  botId: number;
  userId: number;
  symbol: string;
  botType: BotTypeEnum;
  isActive: boolean;
  // Trạng thái lưới cho Grid Bot
  gridLevels?: GridLevelState[];
  // Trạng thái cho Alpha Signal Bot
  strategyCode?: string;
  candleInterval?: KlineInterval;
  orderQuantity?: string;
  maxStalenessMs?: number;
  lastSignal?: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface SignalPipelineStatus {
  activeAlphaBots: number;
  totalSignalsReceived: number;
  totalOrdersTriggered: number;
  totalSkippedStale: number;
  totalSkippedDuplicate: number;
  totalSkippedNoMatch: number;
  totalOrderErrors: number;
  lastSignalId: string | null;
  lastSignalLatencyMs: number | null;
  lastQueueLagMs: number | null;
}
