import { EmaCalculator } from './ema';

describe('EmaCalculator (Financial Technical Indicator)', () => {
  it('should return null if prices array has fewer elements than period', () => {
    const prices = ['10', '11', '12'];
    expect(EmaCalculator.calculate(prices, 5)).toBeNull();
  });

  it('should calculate accurate EMA using BigNumber arithmetic', () => {
    // 5 giá: 10, 11, 12, 13, 14
    // Với period = 3:
    // SMA đầu tiên = (10 + 11 + 12) / 3 = 11
    // alpha = 2 / (3 + 1) = 0.5
    // Price 13: EMA = 13 * 0.5 + 11 * 0.5 = 12
    // Price 14: EMA = 14 * 0.5 + 12 * 0.5 = 13
    const prices = ['10.00', '11.00', '12.00', '13.00', '14.00'];
    const ema = EmaCalculator.calculate(prices, 3);
    expect(ema).toBe('13.00000000');
  });

  it('should detect GOLDEN_CROSS when short EMA crosses above long EMA', () => {
    // Trước đó: short <= long (50 <= 52)
    // Hiện tại: short > long (55 > 53)
    const signal = EmaCalculator.detectCross('50.00', '52.00', '55.00', '53.00');
    expect(signal).toBe('GOLDEN_CROSS');
  });

  it('should detect DEATH_CROSS when short EMA crosses below long EMA', () => {
    // Trước đó: short >= long (60 >= 58)
    // Hiện tại: short < long (56 < 57)
    const signal = EmaCalculator.detectCross('60.00', '58.00', '56.00', '57.00');
    expect(signal).toBe('DEATH_CROSS');
  });

  it('should return NEUTRAL when no crossover occurs', () => {
    // short vẫn luôn cao hơn long (không có giao cắt)
    const signal1 = EmaCalculator.detectCross('60.00', '50.00', '62.00', '51.00');
    expect(signal1).toBe('NEUTRAL');

    // short vẫn luôn thấp hơn long
    const signal2 = EmaCalculator.detectCross('40.00', '50.00', '41.00', '51.00');
    expect(signal2).toBe('NEUTRAL');
  });
});
