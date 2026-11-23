import { OrderbookThrottler } from './orderbook-throttler';

describe('OrderbookThrottler (DOM Protection & Backpressure Throttle)', () => {
  let throttler: OrderbookThrottler;

  beforeEach(() => {
    jest.useFakeTimers();
    throttler = new OrderbookThrottler(100);
  });

  afterEach(() => {
    throttler.destroy();
    jest.useRealTimers();
  });

  it('should execute the first event immediately (Leading Edge Zero-Latency)', () => {
    const callback = jest.fn();
    throttler.trigger('BTCUSDT', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('BTCUSDT');
    expect(throttler.getPendingTimersCount()).toBe(0);
  });

  it('should coalesce rapid successive events within 100ms window into 1 trailing execution', () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();
    const callback3 = jest.fn();

    // 1st call: Leading edge executes immediately
    throttler.trigger('BTCUSDT', callback1);
    expect(callback1).toHaveBeenCalledTimes(1);

    // Advance 20ms: 2nd call
    jest.advanceTimersByTime(20);
    throttler.trigger('BTCUSDT', callback2);
    expect(callback2).not.toHaveBeenCalled();

    // Advance another 30ms: 3rd call
    jest.advanceTimersByTime(30);
    throttler.trigger('BTCUSDT', callback3);
    expect(callback3).not.toHaveBeenCalled();

    // Still within 100ms window (total 50ms elapsed), 1 timer is pending
    expect(throttler.getPendingTimersCount()).toBe(1);

    // Fast-forward past remaining 50ms (total 100ms)
    jest.advanceTimersByTime(55);

    // Trailing edge fires with the latest callback (callback3)
    expect(callback2).not.toHaveBeenCalled(); // Overwritten by newer snapshot
    expect(callback3).toHaveBeenCalledTimes(1);
    expect(throttler.getPendingTimersCount()).toBe(0);
  });

  it('should isolate throttles by symbol independently', () => {
    const btcCallback = jest.fn();
    const ethCallback = jest.fn();

    throttler.trigger('BTCUSDT', btcCallback);
    throttler.trigger('ETHUSDT', ethCallback);

    // Both fire immediately as they are different symbols
    expect(btcCallback).toHaveBeenCalledTimes(1);
    expect(ethCallback).toHaveBeenCalledTimes(1);
  });

  it('should clean up all active timers on destroy()', () => {
    const btcCallback = jest.fn();
    throttler.trigger('BTCUSDT', btcCallback); // 1st: immediate

    jest.advanceTimersByTime(10);
    throttler.trigger('BTCUSDT', jest.fn()); // 2nd: scheduled
    expect(throttler.getPendingTimersCount()).toBe(1);

    throttler.destroy();
    expect(throttler.getPendingTimersCount()).toBe(0);
  });
});
