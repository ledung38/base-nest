import { BotTypeEnum, OrderSideEnum } from 'src/constant/trading.enum';

export interface GridParameters {
  lowerPrice: string;       // Mức giá sàn dưới của lưới (ví dụ: '60000.00')
  upperPrice: string;       // Mức giá trần trên của lưới (ví dụ: '70000.00')
  gridLevels: number;       // Số mức lưới chia đều (ví dụ: 5 tầng)
  quantityPerGrid: string;  // Khối lượng đặt cho mỗi mức (ví dụ: '0.01000000')
}

export interface EmaCrossParameters {
  shortPeriod: number;      // Chu kỳ EMA ngắn hạn (mặc định 9)
  longPeriod: number;       // Chu kỳ EMA dài hạn (mặc định 21)
  orderQuantity: string;    // Khối lượng mỗi lần vào lệnh (ví dụ: '0.05000000')
  candleInterval: string;   // Khung thời gian nến phân tích (mặc định '1m')
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
  // Trạng thái EMA trước đó để bắt điểm giao cắt (Cross detection)
  prevShortEma?: string;
  prevLongEma?: string;
  lastSignal?: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface IndicatorSnapshot {
  symbol: string;
  interval: string;
  candleCount: number;
  currentPrice: string;
  shortEma: string | null;
  longEma: string | null;
  signal: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NEUTRAL';
}
