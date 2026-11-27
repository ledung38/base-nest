import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { ENV } from 'src/config/environment';
import {
  Candlestick,
  KlineInterval,
  KLINE_INTERVAL_MS,
} from './market.interface';

export interface FetchKlinesParams {
  symbol: string;
  interval: KlineInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
  closedOnly?: boolean;
}

// Cấu trúc tuple trả về từ Binance Spot API GET /api/v3/klines
type BinanceRawKline = [
  number, // 0: Open time
  string, // 1: Open
  string, // 2: High
  string, // 3: Low
  string, // 4: Close
  string, // 5: Volume
  number, // 6: Close time
  string, // 7: Quote asset volume
  number, // 8: Number of trades
  string, // 9: Taker buy base asset volume
  string, // 10: Taker buy quote asset volume
  string, // 11: Unused field
];

/**
 * Client gọi Binance Spot REST API (GET /api/v3/klines) với:
 * - Phân trang tự động (tối đa 1000 nến/request, weight = 2)
 * - Theo dõi header X-MBX-USED-WEIGHT-1M tránh chạm giới hạn 6000 weight/phút
 * - Backoff tự động khi nhận HTTP 429 / 418
 */
@Injectable()
export class BinanceRestService {
  private readonly logger = new Logger(BinanceRestService.name);
  private readonly http: AxiosInstance;
  private readonly MAX_LIMIT = 1000;
  private readonly MAX_RETRIES = 3;
  private readonly WEIGHT_SOFT_LIMIT = 4500;

  private lastUsedWeight1m = 0;

  constructor() {
    this.http = axios.create({
      baseURL: ENV.BINANCE.REST_URL,
      timeout: 10000,
    });
  }

  protected async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Parse raw Binance kline array sang chuẩn Candlestick.
   * Mặc định loại bỏ nến chưa chốt (closeTime > now) để tránh làm lệch chỉ báo.
   */
  parseRawKlines(
    symbol: string,
    interval: KlineInterval,
    rawList: BinanceRawKline[],
    now = Date.now(),
    closedOnly = true,
  ): Candlestick[] {
    const upperSymbol = symbol.toUpperCase();
    const result: Candlestick[] = [];

    for (const item of rawList) {
      const openTime = Number(item[0]);
      const closeTime = Number(item[6]);
      const isClosed = closeTime <= now;

      if (closedOnly && !isClosed) {
        continue;
      }

      result.push({
        symbol: upperSymbol,
        interval,
        openTime,
        closeTime,
        open: String(item[1]),
        high: String(item[2]),
        low: String(item[3]),
        close: String(item[4]),
        volume: String(item[5]),
        tradesCount: Number(item[8] || 0),
        isClosed,
      });
    }

    return result;
  }

  /**
   * Gọi một request GET /api/v3/klines kèm retry khi gặp 429/418.
   */
  async fetchKlines(params: FetchKlinesParams): Promise<Candlestick[]> {
    const limit = Math.min(Math.max(params.limit ?? this.MAX_LIMIT, 1), this.MAX_LIMIT);
    const closedOnly = params.closedOnly ?? true;

    const query: Record<string, string | number> = {
      symbol: params.symbol.toUpperCase(),
      interval: params.interval,
      limit,
    };
    if (params.startTime !== undefined) {
      query.startTime = params.startTime;
    }
    if (params.endTime !== undefined) {
      query.endTime = params.endTime;
    }

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (this.lastUsedWeight1m >= this.WEIGHT_SOFT_LIMIT) {
          this.logger.warn(
            `Binance REST weight near limit (${this.lastUsedWeight1m}/6000). Throttling 1000ms...`,
          );
          await this.sleep(1000);
        }

        const response = await this.http.get<BinanceRawKline[]>(
          '/api/v3/klines',
          { params: query },
        );

        const weightHeader =
          response.headers?.['x-mbx-used-weight-1m'] ||
          response.headers?.['X-MBX-USED-WEIGHT-1M'];
        if (weightHeader !== undefined) {
          const parsedWeight = Number(weightHeader);
          if (!Number.isNaN(parsedWeight)) {
            this.lastUsedWeight1m = parsedWeight;
          }
        }

        return this.parseRawKlines(
          params.symbol,
          params.interval,
          response.data || [],
          Date.now(),
          closedOnly,
        );
      } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status;
        const isRateLimited = status === 429 || status === 418;

        if (isRateLimited && attempt < this.MAX_RETRIES) {
          const retryAfterHeader = axiosErr.response?.headers?.['retry-after'];
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : 0;
          const waitMs =
            retryAfterSec > 0
              ? retryAfterSec * 1000
              : Math.min(1000 * Math.pow(2, attempt + 1), 15000);

          this.logger.warn(
            `Binance REST rate-limited (HTTP ${status}) for ${params.symbol} ${params.interval}. Backing off ${waitMs}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})`,
          );
          await this.sleep(waitMs);
          continue;
        }

        throw err;
      }
    }

    return [];
  }

  /**
   * Phân trang lấy toàn bộ nến chốt trong khoảng [startTime, endTime].
   */
  async fetchKlinesRange(
    symbol: string,
    interval: KlineInterval,
    startTime: number,
    endTime = Date.now(),
    maxPages = 20,
  ): Promise<Candlestick[]> {
    const stepMs = KLINE_INTERVAL_MS[interval];
    const collected: Candlestick[] = [];
    let cursor = startTime;

    for (let page = 0; page < maxPages && cursor <= endTime; page++) {
      const batch = await this.fetchKlines({
        symbol,
        interval,
        startTime: cursor,
        endTime,
        limit: this.MAX_LIMIT,
        closedOnly: true,
      });

      if (batch.length === 0) {
        break;
      }

      collected.push(...batch);

      const lastOpenTime = batch[batch.length - 1].openTime;
      const nextCursor = lastOpenTime + stepMs;
      if (nextCursor <= cursor || batch.length < this.MAX_LIMIT) {
        break;
      }
      cursor = nextCursor;
    }

    return collected;
  }

  getLastUsedWeight1m(): number {
    return this.lastUsedWeight1m;
  }
}
