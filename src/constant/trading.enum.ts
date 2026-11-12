export enum CurrencyEnum {
  USDT = 'USDT',
  BTC = 'BTC',
  ETH = 'ETH',
  SOL = 'SOL',
}

export enum BalanceTypeEnum {
  AVAILABLE = 'AVAILABLE',
  LOCKED = 'LOCKED',
}

export enum LedgerDirectionEnum {
  CREDIT = 'CREDIT', // Cộng tiền vào tài khoản (+)
  DEBIT = 'DEBIT',   // Trừ tiền khỏi tài khoản (-)
}

export enum LedgerReferenceTypeEnum {
  FAUCET = 'FAUCET',                       // Nạp tiền trải nghiệm sandbox
  DEPOSIT = 'DEPOSIT',                     // Nạp tiền
  WITHDRAW = 'WITHDRAW',                   // Rút tiền
  ORDER_LOCK = 'ORDER_LOCK',               // Khóa tiền khi đặt lệnh Limit
  ORDER_UNLOCK = 'ORDER_UNLOCK',           // Hoàn tiền khi hủy lệnh
  TRADE_SETTLEMENT = 'TRADE_SETTLEMENT',   // Khấu trừ/cộng tiền khi khớp lệnh
  TRADING_FEE = 'TRADING_FEE',             // Phí giao dịch
}

export enum OrderSideEnum {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderTypeEnum {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatusEnum {
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum BotTypeEnum {
  GRID_TRADING = 'GRID_TRADING',
  EMA_CROSS = 'EMA_CROSS',
}

