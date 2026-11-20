import { OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';
import { OrderBook } from './orderbook';
import { OrderBookEntry } from './matching.interface';

describe('OrderBook (In-Memory Limit Order Book)', () => {
  let orderbook: OrderBook;

  beforeEach(() => {
    orderbook = new OrderBook('BTCUSDT');
  });

  const createMockOrder = (
    orderId: number,
    side: OrderSideEnum,
    price: string,
    quantity: string,
    createdAt: number = Date.now(),
  ): OrderBookEntry => ({
    orderId,
    userId: 100 + orderId,
    symbol: 'BTCUSDT',
    side,
    type: OrderTypeEnum.LIMIT,
    price,
    quantity,
    unfilledQuantity: quantity,
    lockedCurrency: side === OrderSideEnum.BUY ? 'USDT' : 'BTC',
    lockedAmount: '1000',
    createdAt,
  });

  describe('Order Insertion & Price-Time Priority (FIFO)', () => {
    it('should sort BIDS descending by price, and FIFO for identical price', () => {
      // 3 lệnh mua: Giá 64000 (t1), Giá 65000 (t2), Giá 64000 (t3)
      const o1 = createMockOrder(1, OrderSideEnum.BUY, '64000.00', '1.0', 1000);
      const o2 = createMockOrder(2, OrderSideEnum.BUY, '65000.00', '2.0', 2000);
      const o3 = createMockOrder(3, OrderSideEnum.BUY, '64000.00', '1.5', 3000);

      orderbook.addOrder(o1);
      orderbook.addOrder(o2);
      orderbook.addOrder(o3);

      expect(orderbook.getBestBid()?.orderId).toBe(2); // Giá cao nhất 65,000 đứng đầu

      const depth = orderbook.getDepth();
      expect(depth.bids).toHaveLength(2); // 2 mức giá: 65,000 và 64,000
      expect(depth.bids[0].price).toBe('65000.00');
      expect(depth.bids[0].quantity).toBe('2.00000000');
      expect(depth.bids[1].price).toBe('64000.00');
      expect(depth.bids[1].quantity).toBe('2.50000000'); // 1.0 + 1.5
      expect(depth.bids[1].orderCount).toBe(2);
    });

    it('should sort ASKS ascending by price, and FIFO for identical price', () => {
      // 3 lệnh bán: Giá 66000 (t1), Giá 65500 (t2), Giá 66000 (t3)
      const o1 = createMockOrder(1, OrderSideEnum.SELL, '66000.00', '1.0', 1000);
      const o2 = createMockOrder(2, OrderSideEnum.SELL, '65500.00', '0.5', 2000);
      const o3 = createMockOrder(3, OrderSideEnum.SELL, '66000.00', '2.0', 3000);

      orderbook.addOrder(o1);
      orderbook.addOrder(o2);
      orderbook.addOrder(o3);

      expect(orderbook.getBestAsk()?.orderId).toBe(2); // Giá rẻ nhất 65,500 đứng đầu

      const depth = orderbook.getDepth();
      expect(depth.asks).toHaveLength(2);
      expect(depth.asks[0].price).toBe('65500.00');
      expect(depth.asks[0].quantity).toBe('0.50000000');
      expect(depth.asks[1].price).toBe('66000.00');
      expect(depth.asks[1].quantity).toBe('3.00000000'); // 1.0 + 2.0
    });

    it('should remove order cleanly by orderId', () => {
      const o1 = createMockOrder(1, OrderSideEnum.BUY, '65000.00', '1.0');
      orderbook.addOrder(o1);
      expect(orderbook.getTotalOrdersCount().total).toBe(1);

      const removed = orderbook.removeOrder(1);
      expect(removed?.orderId).toBe(1);
      expect(orderbook.getTotalOrdersCount().total).toBe(0);
      expect(orderbook.getBestBid()).toBeUndefined();
    });
  });

  describe('matchLimitOrder (P2P Matching)', () => {
    it('should fully match incoming Buy limit with existing Ask limit at Maker price', () => {
      // Maker đặt lệnh bán 1.0 BTC @ 65000
      const ask = createMockOrder(1, OrderSideEnum.SELL, '65000.00', '1.00000000', 1000);
      orderbook.addOrder(ask);

      // Taker đặt lệnh mua 1.0 BTC @ 65500 (sẵn sàng trả tới 65500, nhưng khớp tại 65000 giá Maker!)
      const incomingBuy = createMockOrder(2, OrderSideEnum.BUY, '65500.00', '1.00000000', 2000);
      const result = orderbook.matchLimitOrder(incomingBuy);

      expect(result.isFullyFilled).toBe(true);
      expect(result.fills).toHaveLength(1);
      expect(result.fills[0]).toEqual({
        makerOrderId: 1,
        makerUserId: 101,
        takerOrderId: 2,
        takerUserId: 102,
        symbol: 'BTCUSDT',
        price: '65000.00', // Khớp tại Maker price
        quantity: '1.00000000',
        quoteAmount: '65000.00000000',
        takerSide: OrderSideEnum.BUY,
        isSimulatedLiquidity: false,
      });

      // Sổ lệnh trống vì cả 2 lệnh đã khớp hết
      expect(orderbook.getTotalOrdersCount().total).toBe(0);
    });

    it('should handle partial fills and rest the remaining quantity on the book', () => {
      // Maker đặt bán 0.4 BTC @ 65000
      const ask = createMockOrder(1, OrderSideEnum.SELL, '65000.00', '0.40000000');
      orderbook.addOrder(ask);

      // Taker đặt mua 1.0 BTC @ 65000
      const incomingBuy = createMockOrder(2, OrderSideEnum.BUY, '65000.00', '1.00000000');
      const result = orderbook.matchLimitOrder(incomingBuy);

      expect(result.isFullyFilled).toBe(false);
      expect(result.unfilledQuantity).toBe('0.60000000');
      expect(result.fills).toHaveLength(1);
      expect(result.fills[0].quantity).toBe('0.40000000');

      // 0.6 BTC còn lại của Buy order được treo vào sổ lệnh
      expect(orderbook.getTotalOrdersCount().bids).toBe(1);
      expect(orderbook.getBestBid()?.unfilledQuantity).toBe('0.60000000');
    });

    it('should not match if prices do not cross, and rest on book', () => {
      // Maker đặt bán @ 66000
      const ask = createMockOrder(1, OrderSideEnum.SELL, '66000.00', '1.00000000');
      orderbook.addOrder(ask);

      // Taker đặt mua @ 65000 (thấp hơn giá bán -> không khớp)
      const incomingBuy = createMockOrder(2, OrderSideEnum.BUY, '65000.00', '1.00000000');
      const result = orderbook.matchLimitOrder(incomingBuy);

      expect(result.fills).toHaveLength(0);
      expect(result.isFullyFilled).toBe(false);
      expect(orderbook.getTotalOrdersCount().bids).toBe(1);
      expect(orderbook.getTotalOrdersCount().asks).toBe(1);
    });
  });

  describe('matchMarketOrder & Simulated Liquidity', () => {
    it('should match internal orderbook first, then fill remainder against fallback market price', () => {
      // Maker bán 0.3 BTC @ 65000
      const ask = createMockOrder(1, OrderSideEnum.SELL, '65000.00', '0.30000000');
      orderbook.addOrder(ask);

      // Taker đặt Market Buy 1.0 BTC với fallback Binance price 65100
      const marketBuy = createMockOrder(2, OrderSideEnum.BUY, '0.00', '1.00000000');
      marketBuy.type = OrderTypeEnum.MARKET;

      const result = orderbook.matchMarketOrder(marketBuy, '65100.00');

      expect(result.isFullyFilled).toBe(true);
      expect(result.fills).toHaveLength(2);

      // Fill 1: P2P khớp 0.3 BTC với Maker
      expect(result.fills[0].makerOrderId).toBe(1);
      expect(result.fills[0].price).toBe('65000.00');
      expect(result.fills[0].quantity).toBe('0.30000000');
      expect(result.fills[0].isSimulatedLiquidity).toBe(false);

      // Fill 2: Khớp 0.7 BTC còn lại với Simulated Market Binance
      expect(result.fills[1].makerOrderId).toBeNull();
      expect(result.fills[1].price).toBe('65100.00');
      expect(result.fills[1].quantity).toBe('0.70000000');
      expect(result.fills[1].isSimulatedLiquidity).toBe(true);
    });
  });

  describe('matchRestingOrdersAgainstTick (Tick-Driven Matching)', () => {
    it('should fill resting BUY limit orders when market tick price drops below or equal to limit price', () => {
      // User treo lệnh BUY 0.5 BTC @ 65000
      const bid = createMockOrder(1, OrderSideEnum.BUY, '65000.00', '0.50000000');
      orderbook.addOrder(bid);

      // Binance tick rớt xuống 64900 (rẻ hơn mức user đặt mua)
      const fills = orderbook.matchRestingOrdersAgainstTick('64900.00');

      expect(fills).toHaveLength(1);
      expect(fills[0].takerOrderId).toBe(1);
      expect(fills[0].price).toBe('64900.00');
      expect(fills[0].quantity).toBe('0.50000000');
      expect(fills[0].isSimulatedLiquidity).toBe(true);

      // Lệnh đã khớp xong -> xóa khỏi sổ lệnh
      expect(orderbook.getTotalOrdersCount().bids).toBe(0);
    });

    it('should fill resting SELL limit orders when market tick price rises above or equal to limit price', () => {
      // User treo lệnh SELL 2.0 BTC @ 66000
      const ask = createMockOrder(1, OrderSideEnum.SELL, '66000.00', '2.00000000');
      orderbook.addOrder(ask);

      // Binance tick tăng lên 66200
      const fills = orderbook.matchRestingOrdersAgainstTick('66200.00');

      expect(fills).toHaveLength(1);
      expect(fills[0].takerOrderId).toBe(1);
      expect(fills[0].price).toBe('66200.00');
      expect(fills[0].quantity).toBe('2.00000000');
      expect(orderbook.getTotalOrdersCount().asks).toBe(0);
    });
  });
});
