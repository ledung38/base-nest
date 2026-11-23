import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * OrderbookThrottler (Client-side Backpressure & DOM Protection)
 *
 * Ngăn chặn quá tải DOM và Event Loop của frontend Next.js khi thị trường biến động dữ dội.
 * Áp dụng thuật toán Leading + Trailing Edge Throttling (mặc định 100ms = tối đa 10 updates/giây/cặp coin):
 * 1. Sự kiện đầu tiên được phát đi ngay lập tức (Zero Latency).
 * 2. Hàng loạt biến động tiếp theo trong cửa sổ 100ms được gộp lại (coalesced),
 *    chỉ phát một bản chụp (snapshot) mới nhất ở cuối cửa sổ.
 */
@Injectable()
export class OrderbookThrottler implements OnModuleDestroy {
  private readonly logger = new Logger(OrderbookThrottler.name);
  private readonly defaultThrottleMs: number;
  private readonly lastExecuted = new Map<string, number>();
  private readonly activeTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingCallbacks = new Map<string, (symbol: string) => Promise<void> | void>();

  constructor(throttleMs = 100) {
    this.defaultThrottleMs = throttleMs;
  }

  onModuleDestroy() {
    this.destroy();
  }

  /**
   * Kích hoạt phát cập nhật sổ lệnh có kiểm soát tần suất (Throttle)
   *
   * @param symbol Cặp coin (e.g. 'BTCUSDT')
   * @param action Callback lấy độ sâu sổ lệnh mới nhất và phát đi
   */
  trigger(
    symbol: string,
    action: (symbol: string) => Promise<void> | void,
    throttleMs = this.defaultThrottleMs,
  ): void {
    const sym = symbol.toUpperCase();
    const now = Date.now();
    const lastTime = this.lastExecuted.get(sym) || 0;
    const elapsed = now - lastTime;

    this.pendingCallbacks.set(sym, action);

    // Trường hợp 1: Đã vượt quá khoảng thời gian throttle -> Thực thi ngay lập tức (Leading edge)
    if (elapsed >= throttleMs && !this.activeTimers.has(sym)) {
      this.lastExecuted.set(sym, now);
      this.executeAction(sym);
      return;
    }

    // Trường hợp 2: Đang trong khoảng thời gian throttle và chưa có timer chờ -> Lên lịch (Trailing edge)
    if (!this.activeTimers.has(sym)) {
      const waitTime = Math.max(throttleMs - elapsed, 10);
      const timer = setTimeout(() => {
        this.activeTimers.delete(sym);
        this.lastExecuted.set(sym, Date.now());
        this.executeAction(sym);
      }, waitTime);

      this.activeTimers.set(sym, timer);
    }
    // Nếu đã có timer đang đếm lùi, ta chỉ cần cập nhật action mới nhất trong pendingCallbacks
  }

  private executeAction(symbol: string): void {
    const action = this.pendingCallbacks.get(symbol);
    if (!action) return;

    this.pendingCallbacks.delete(symbol);
    try {
      const result = action(symbol);
      if (result instanceof Promise) {
        result.catch((err) => {
          this.logger.error(`Error executing throttled action for ${symbol}:`, err);
        });
      }
    } catch (err) {
      this.logger.error(`Synchronous error in throttled action for ${symbol}:`, err);
    }
  }

  /**
   * Dọn dẹp toàn bộ timers đang chờ (Dùng khi shutdown hoặc reset test)
   */
  destroy(): void {
    for (const timer of this.activeTimers.values()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    this.pendingCallbacks.clear();
    this.lastExecuted.clear();
  }

  getPendingTimersCount(): number {
    return this.activeTimers.size;
  }
}
