import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { Order } from 'src/entities/order.entity';

export interface OrderQueueMessage {
  orderId: number;
  userId: number;
  idempotencyKey: string;
  symbol: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  price: string;
  quantity: string;
  lockedCurrency: CurrencyEnum;
  requiredLockAmount: string;
  enqueuedAt: number;
}

export type OrderEventRoutingKey =
  | 'order.queued'
  | 'order.pending'
  | 'order.rejected'
  | 'order.cancelled'
  | 'trade.executed';

export interface OrderDomainEvent {
  event: OrderEventRoutingKey;
  orderId: number;
  userId: number;
  symbol: string;
  side: OrderSideEnum;
  type: OrderTypeEnum;
  price: string;
  quantity: string;
  lockedCurrency: CurrencyEnum;
  lockedAmount: string;
  status: OrderStatusEnum;
  rejectReason?: string | null;
  timestamp: number;
}

export interface TradeDomainEvent {
  event: 'trade.executed';
  tradeId: number;
  symbol: string;
  buyOrderId: number | null;
  sellOrderId: number | null;
  buyerId: number | null;
  sellerId: number | null;
  price: string;
  quantity: string;
  quoteAmount: string;
  takerSide: OrderSideEnum;
  isSimulatedLiquidity: boolean;
  timestamp: number;
}

export type AnyDomainEvent = OrderDomainEvent | TradeDomainEvent;

export interface IdempotencyCacheRecord {
  status: 'PROCESSING' | 'COMPLETED';
  orderId?: number;
  order?: Order;
  updatedAt: number;
}

export type OrderQueueHandler = (message: OrderQueueMessage) => Promise<'ACK' | 'DEAD_LETTER'>;
