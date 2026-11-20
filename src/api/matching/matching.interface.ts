import { OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';

export interface OrderBookEntry {
  orderId: number;
  userId: number;
  symbol: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  price: string;            // BigNumber string định dạng thập phân
  quantity: string;         // Khối lượng gốc ban đầu
  unfilledQuantity: string; // Khối lượng còn lại chưa khớp
  lockedCurrency: string;
  lockedAmount: string;
  createdAt: number;        // Timestamp tạo lệnh (Epoch ms) để xếp hàng FIFO
}

export interface MatchFill {
  makerOrderId: number | null;
  makerUserId: number | null;
  takerOrderId: number;
  takerUserId: number;
  symbol: string;
  price: string;
  quantity: string;
  quoteAmount: string; // price * quantity (USDT)
  takerSide: OrderSideEnum;
  isSimulatedLiquidity: boolean;
}

export interface MatchExecutionResult {
  incomingOrder: OrderBookEntry;
  fills: MatchFill[];
  unfilledQuantity: string;
  isFullyFilled: boolean;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
  orderCount: number;
}

export interface OrderBookDepth {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}
