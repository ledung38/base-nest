import BigNumber from 'bignumber.js';
import { OrderSideEnum } from 'src/constant/trading.enum';
import {
  MatchExecutionResult,
  MatchFill,
  OrderBookDepth,
  OrderBookEntry,
  OrderBookLevel,
} from './matching.interface';

export class OrderBook {
  readonly symbol: string;
  private bids: OrderBookEntry[] = []; // Giá cao đứng trước (descending), cùng giá thì ai đến trước đứng trước (FIFO)
  private asks: OrderBookEntry[] = []; // Giá thấp đứng trước (ascending), cùng giá thì ai đến trước đứng trước (FIFO)
  private orderMap = new Map<number, OrderBookEntry>();

  constructor(symbol: string) {
    this.symbol = symbol.toUpperCase();
  }

  /**
   * Thêm một Limit Order vào Sổ Lệnh theo nguyên tắc Price-Time Priority
   */
  addOrder(order: OrderBookEntry): void {
    if (new BigNumber(order.unfilledQuantity).isLessThanOrEqualTo(0)) {
      return;
    }

    this.orderMap.set(order.orderId, order);

    if (order.side === OrderSideEnum.BUY) {
      this.insertSorted(this.bids, order, (a, b) => {
        const priceA = new BigNumber(a.price);
        const priceB = new BigNumber(b.price);
        if (!priceA.isEqualTo(priceB)) {
          return priceB.minus(priceA).toNumber(); // Giá cao hơn xếp trước (descending)
        }
        return a.createdAt - b.createdAt; // Cùng giá thì thời gian sớm hơn xếp trước (FIFO)
      });
    } else {
      this.insertSorted(this.asks, order, (a, b) => {
        const priceA = new BigNumber(a.price);
        const priceB = new BigNumber(b.price);
        if (!priceA.isEqualTo(priceB)) {
          return priceA.minus(priceB).toNumber(); // Giá thấp hơn xếp trước (ascending)
        }
        return a.createdAt - b.createdAt; // Cùng giá thì thời gian sớm hơn xếp trước (FIFO)
      });
    }
  }

  /**
   * Hủy lệnh khỏi sổ lệnh theo orderId
   */
  removeOrder(orderId: number): OrderBookEntry | undefined {
    const order = this.orderMap.get(orderId);
    if (!order) return undefined;

    this.orderMap.delete(orderId);
    if (order.side === OrderSideEnum.BUY) {
      const idx = this.bids.findIndex((o) => o.orderId === orderId);
      if (idx !== -1) this.bids.splice(idx, 1);
    } else {
      const idx = this.asks.findIndex((o) => o.orderId === orderId);
      if (idx !== -1) this.asks.splice(idx, 1);
    }

    return order;
  }

  getOrder(orderId: number): OrderBookEntry | undefined {
    return this.orderMap.get(orderId);
  }

  getBestBid(): OrderBookEntry | undefined {
    return this.bids[0];
  }

  getBestAsk(): OrderBookEntry | undefined {
    return this.asks[0];
  }

  getTotalOrdersCount(): { bids: number; asks: number; total: number } {
    return {
      bids: this.bids.length,
      asks: this.asks.length,
      total: this.orderMap.size,
    };
  }

  /**
   * Khớp một lệnh LIMIT mới đến (Taker) với các lệnh đang treo trong Sổ Lệnh (Maker)
   */
  matchLimitOrder(incoming: OrderBookEntry): MatchExecutionResult {
    const fills: MatchFill[] = [];
    let unfilledBN = new BigNumber(incoming.unfilledQuantity);
    const incomingPriceBN = new BigNumber(incoming.price);

    if (incoming.side === OrderSideEnum.BUY) {
      // BUY limit: Khớp với các ASKS có giá <= incoming.price
      while (this.asks.length > 0 && unfilledBN.isGreaterThan(0)) {
        const bestAsk = this.asks[0];
        const bestAskPriceBN = new BigNumber(bestAsk.price);

        // Nếu giá chào bán thấp nhất của Maker vượt quá mức giá người mua chấp nhận trả -> Dừng khớp
        if (bestAskPriceBN.isGreaterThan(incomingPriceBN)) {
          break;
        }

        const matchQtyBN = BigNumber.minimum(
          unfilledBN,
          new BigNumber(bestAsk.unfilledQuantity),
        );
        const matchPrice = bestAsk.price; // Giá khớp ưu tiên theo Maker (người đặt lệnh trước)
        const quoteAmountBN = matchQtyBN.multipliedBy(new BigNumber(matchPrice));

        fills.push({
          makerOrderId: bestAsk.orderId,
          makerUserId: bestAsk.userId,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQtyBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.BUY,
          isSimulatedLiquidity: false,
        });

        // Trừ khối lượng còn lại
        unfilledBN = unfilledBN.minus(matchQtyBN);
        const makerRemainingBN = new BigNumber(bestAsk.unfilledQuantity).minus(
          matchQtyBN,
        );
        bestAsk.unfilledQuantity = makerRemainingBN.toFixed(8);

        if (makerRemainingBN.isLessThanOrEqualTo(0)) {
          this.asks.shift();
          this.orderMap.delete(bestAsk.orderId);
        }
      }
    } else {
      // SELL limit: Khớp với các BIDS có giá >= incoming.price
      while (this.bids.length > 0 && unfilledBN.isGreaterThan(0)) {
        const bestBid = this.bids[0];
        const bestBidPriceBN = new BigNumber(bestBid.price);

        // Nếu giá chào mua cao nhất của Maker thấp hơn mức giá người bán chấp nhận bán -> Dừng khớp
        if (bestBidPriceBN.isLessThan(incomingPriceBN)) {
          break;
        }

        const matchQtyBN = BigNumber.minimum(
          unfilledBN,
          new BigNumber(bestBid.unfilledQuantity),
        );
        const matchPrice = bestBid.price; // Giá khớp ưu tiên theo Maker
        const quoteAmountBN = matchQtyBN.multipliedBy(new BigNumber(matchPrice));

        fills.push({
          makerOrderId: bestBid.orderId,
          makerUserId: bestBid.userId,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQtyBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.SELL,
          isSimulatedLiquidity: false,
        });

        unfilledBN = unfilledBN.minus(matchQtyBN);
        const makerRemainingBN = new BigNumber(bestBid.unfilledQuantity).minus(
          matchQtyBN,
        );
        bestBid.unfilledQuantity = makerRemainingBN.toFixed(8);

        if (makerRemainingBN.isLessThanOrEqualTo(0)) {
          this.bids.shift();
          this.orderMap.delete(bestBid.orderId);
        }
      }
    }

    incoming.unfilledQuantity = unfilledBN.toFixed(8);
    const isFullyFilled = unfilledBN.isLessThanOrEqualTo(0);

    // Nếu vẫn còn khối lượng chưa khớp, treo phần dư vào Sổ Lệnh
    if (!isFullyFilled) {
      this.addOrder(incoming);
    }

    return {
      incomingOrder: incoming,
      fills,
      unfilledQuantity: incoming.unfilledQuantity,
      isFullyFilled,
    };
  }

  /**
   * Khớp một lệnh MARKET mới đến (Taker)
   * Khớp trước với Sổ lệnh nội bộ; nếu thiếu thanh khoản, tự động quét theo giá thị trường Binance (Simulated Liquidity)
   */
  matchMarketOrder(
    incoming: OrderBookEntry,
    fallbackMarketPrice?: string,
  ): MatchExecutionResult {
    const fills: MatchFill[] = [];
    let unfilledBN = new BigNumber(incoming.unfilledQuantity);

    if (incoming.side === OrderSideEnum.BUY) {
      // 1. Quét sạch các lệnh bán Asks trong sổ lệnh (từ rẻ nhất lên đắt dần)
      while (this.asks.length > 0 && unfilledBN.isGreaterThan(0)) {
        const bestAsk = this.asks[0];
        const matchQtyBN = BigNumber.minimum(
          unfilledBN,
          new BigNumber(bestAsk.unfilledQuantity),
        );
        const matchPrice = bestAsk.price;
        const quoteAmountBN = matchQtyBN.multipliedBy(new BigNumber(matchPrice));

        fills.push({
          makerOrderId: bestAsk.orderId,
          makerUserId: bestAsk.userId,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQtyBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.BUY,
          isSimulatedLiquidity: false,
        });

        unfilledBN = unfilledBN.minus(matchQtyBN);
        const makerRemainingBN = new BigNumber(bestAsk.unfilledQuantity).minus(
          matchQtyBN,
        );
        bestAsk.unfilledQuantity = makerRemainingBN.toFixed(8);

        if (makerRemainingBN.isLessThanOrEqualTo(0)) {
          this.asks.shift();
          this.orderMap.delete(bestAsk.orderId);
        }
      }

      // 2. Nếu sổ lệnh hết hàng và có giá thị trường Binance thực tế -> Khớp phần dư với Simulated Liquidity
      if (unfilledBN.isGreaterThan(0) && fallbackMarketPrice) {
        const simPrice = fallbackMarketPrice;
        const quoteAmountBN = unfilledBN.multipliedBy(new BigNumber(simPrice));

        fills.push({
          makerOrderId: null,
          makerUserId: null,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: simPrice,
          quantity: unfilledBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.BUY,
          isSimulatedLiquidity: true,
        });

        unfilledBN = new BigNumber(0);
      }
    } else {
      // 1. Quét sạch các lệnh mua Bids trong sổ lệnh (từ đắt nhất xuống rẻ dần)
      while (this.bids.length > 0 && unfilledBN.isGreaterThan(0)) {
        const bestBid = this.bids[0];
        const matchQtyBN = BigNumber.minimum(
          unfilledBN,
          new BigNumber(bestBid.unfilledQuantity),
        );
        const matchPrice = bestBid.price;
        const quoteAmountBN = matchQtyBN.multipliedBy(new BigNumber(matchPrice));

        fills.push({
          makerOrderId: bestBid.orderId,
          makerUserId: bestBid.userId,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: matchPrice,
          quantity: matchQtyBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.SELL,
          isSimulatedLiquidity: false,
        });

        unfilledBN = unfilledBN.minus(matchQtyBN);
        const makerRemainingBN = new BigNumber(bestBid.unfilledQuantity).minus(
          matchQtyBN,
        );
        bestBid.unfilledQuantity = makerRemainingBN.toFixed(8);

        if (makerRemainingBN.isLessThanOrEqualTo(0)) {
          this.bids.shift();
          this.orderMap.delete(bestBid.orderId);
        }
      }

      // 2. Khớp phần dư với Simulated Liquidity Binance
      if (unfilledBN.isGreaterThan(0) && fallbackMarketPrice) {
        const simPrice = fallbackMarketPrice;
        const quoteAmountBN = unfilledBN.multipliedBy(new BigNumber(simPrice));

        fills.push({
          makerOrderId: null,
          makerUserId: null,
          takerOrderId: incoming.orderId,
          takerUserId: incoming.userId,
          symbol: this.symbol,
          price: simPrice,
          quantity: unfilledBN.toFixed(8),
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.SELL,
          isSimulatedLiquidity: true,
        });

        unfilledBN = new BigNumber(0);
      }
    }

    incoming.unfilledQuantity = unfilledBN.toFixed(8);
    const isFullyFilled = unfilledBN.isLessThanOrEqualTo(0);

    return {
      incomingOrder: incoming,
      fills,
      unfilledQuantity: incoming.unfilledQuantity,
      isFullyFilled,
    };
  }

  /**
   * Khớp các lệnh LIMIT đang treo trong sổ lệnh dựa trên Tick giá thực tế từ Binance (Simulated Fill)
   * - BUY limit treo giá >= tickPrice: khớp tại tickPrice hoặc order.price
   * - SELL limit treo giá <= tickPrice: khớp tại tickPrice hoặc order.price
   */
  matchRestingOrdersAgainstTick(tickPrice: string): MatchFill[] {
    const fills: MatchFill[] = [];
    const tickPriceBN = new BigNumber(tickPrice);

    // 1. Quét các lệnh BUY đang treo: Nếu giá đặt >= giá thị trường -> Khớp!
    const filledBuyOrderIds: number[] = [];
    for (const bid of this.bids) {
      const bidPriceBN = new BigNumber(bid.price);
      if (bidPriceBN.isGreaterThanOrEqualTo(tickPriceBN)) {
        const quoteAmountBN = new BigNumber(bid.unfilledQuantity).multipliedBy(
          tickPriceBN,
        );

        fills.push({
          makerOrderId: bid.orderId,
          makerUserId: bid.userId,
          takerOrderId: bid.orderId, // Lệnh tự kích hoạt theo thị trường
          takerUserId: bid.userId,
          symbol: this.symbol,
          price: tickPrice,
          quantity: bid.unfilledQuantity,
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.BUY,
          isSimulatedLiquidity: true,
        });

        bid.unfilledQuantity = '0.00000000';
        filledBuyOrderIds.push(bid.orderId);
      } else {
        // Vì bids sắp xếp giảm dần theo giá, nếu gặp bid < tickPrice thì tất cả các bid sau đều < tickPrice -> dừng
        break;
      }
    }

    for (const id of filledBuyOrderIds) {
      this.removeOrder(id);
    }

    // 2. Quét các lệnh SELL đang treo: Nếu giá đặt <= giá thị trường -> Khớp!
    const filledSellOrderIds: number[] = [];
    for (const ask of this.asks) {
      const askPriceBN = new BigNumber(ask.price);
      if (askPriceBN.isLessThanOrEqualTo(tickPriceBN)) {
        const quoteAmountBN = new BigNumber(ask.unfilledQuantity).multipliedBy(
          tickPriceBN,
        );

        fills.push({
          makerOrderId: ask.orderId,
          makerUserId: ask.userId,
          takerOrderId: ask.orderId,
          takerUserId: ask.userId,
          symbol: this.symbol,
          price: tickPrice,
          quantity: ask.unfilledQuantity,
          quoteAmount: quoteAmountBN.toFixed(8),
          takerSide: OrderSideEnum.SELL,
          isSimulatedLiquidity: true,
        });

        ask.unfilledQuantity = '0.00000000';
        filledSellOrderIds.push(ask.orderId);
      } else {
        // Asks sắp xếp tăng dần theo giá, nếu ask > tickPrice thì các ask sau đều > tickPrice -> dừng
        break;
      }
    }

    for (const id of filledSellOrderIds) {
      this.removeOrder(id);
    }

    return fills;
  }

  /**
   * Trích xuất L2 Orderbook Depth (Top bids & asks gom theo mức giá) phục vụ vẽ Sổ Lệnh / Centrifugo
   */
  getDepth(limit: number = 20): OrderBookDepth {
    const aggregateLevels = (orders: OrderBookEntry[]): OrderBookLevel[] => {
      const levelMap = new Map<string, { quantityBN: BigNumber; count: number }>();

      for (const order of orders) {
        const price = order.price;
        const entry = levelMap.get(price);
        if (entry) {
          entry.quantityBN = entry.quantityBN.plus(
            new BigNumber(order.unfilledQuantity),
          );
          entry.count += 1;
        } else {
          levelMap.set(price, {
            quantityBN: new BigNumber(order.unfilledQuantity),
            count: 1,
          });
        }
      }

      const levels: OrderBookLevel[] = [];
      for (const [price, { quantityBN, count }] of levelMap.entries()) {
        levels.push({
          price,
          quantity: quantityBN.toFixed(8),
          orderCount: count,
        });
        if (levels.length >= limit) break;
      }

      return levels;
    };

    return {
      symbol: this.symbol,
      bids: aggregateLevels(this.bids),
      asks: aggregateLevels(this.asks),
      timestamp: Date.now(),
    };
  }

  /**
   * Helper chèn phần tử vào mảng đã sắp xếp (Binary Insertion)
   */
  private insertSorted(
    array: OrderBookEntry[],
    item: OrderBookEntry,
    comparator: (a: OrderBookEntry, b: OrderBookEntry) => number,
  ): void {
    let low = 0;
    let high = array.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (comparator(item, array[mid]) < 0) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    array.splice(low, 0, item);
  }
}
