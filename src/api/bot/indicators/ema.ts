import BigNumber from 'bignumber.js';

/**
 * Thư viện tính toán Chỉ báo Kỹ thuật EMA (Exponential Moving Average)
 * 100% sử dụng BigNumber.js - Loại trừ hoàn toàn sai số dấu phẩy động IEEE 754
 */
export class EmaCalculator {
  /**
   * Tính giá trị EMA cuối cùng từ danh sách chuỗi giá đóng cửa (Close Prices)
   *
   * @param prices Mảng giá đóng cửa từ cũ nhất đến mới nhất: [p0, p1, ..., pn]
   * @param period Số chu kỳ (ví dụ: 9 hoặc 21)
   * @returns Giá trị EMA định dạng chuỗi 8 số thập phân, hoặc null nếu không đủ nến
   */
  static calculate(prices: string[], period: number): string | null {
    if (!prices || prices.length < period || period <= 0) {
      return null;
    }

    // Hệ số nhân làm mượt: alpha = 2 / (period + 1)
    const alpha = new BigNumber(2).dividedBy(period + 1);
    const oneMinusAlpha = new BigNumber(1).minus(alpha);

    // 1. Tính SMA cho period phần tử đầu tiên làm điểm khởi đầu cho EMA
    let sum = new BigNumber(0);
    for (let i = 0; i < period; i++) {
      sum = sum.plus(new BigNumber(prices[i]));
    }
    let ema = sum.dividedBy(period);

    // 2. Tính EMA lũy kế cho các phần tử tiếp theo
    for (let i = period; i < prices.length; i++) {
      const price = new BigNumber(prices[i]);
      ema = price.multipliedBy(alpha).plus(ema.multipliedBy(oneMinusAlpha));
    }

    return ema.toFixed(8);
  }

  /**
   * Phát hiện điểm giao cắt giữa 2 đường EMA (Golden Cross / Death Cross)
   *
   * - GOLDEN_CROSS (Bullish / Mua): Đường ngắn hạn cắt LÊN TRÊN đường dài hạn
   * - DEATH_CROSS (Bearish / Bán): Đường ngắn hạn cắt XUỐNG DƯỚI đường dài hạn
   */
  static detectCross(
    shortPrev: string,
    longPrev: string,
    shortCurr: string,
    longCurr: string,
  ): 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NEUTRAL' {
    const sPrev = new BigNumber(shortPrev);
    const lPrev = new BigNumber(longPrev);
    const sCurr = new BigNumber(shortCurr);
    const lCurr = new BigNumber(longCurr);

    // sPrev <= lPrev và sCurr > lCurr -> Golden Cross
    if (sPrev.isLessThanOrEqualTo(lPrev) && sCurr.isGreaterThan(lCurr)) {
      return 'GOLDEN_CROSS';
    }

    // sPrev >= lPrev và sCurr < lCurr -> Death Cross
    if (sPrev.isGreaterThanOrEqualTo(lPrev) && sCurr.isLessThan(lCurr)) {
      return 'DEATH_CROSS';
    }

    return 'NEUTRAL';
  }
}
