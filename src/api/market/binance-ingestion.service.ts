import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ENV } from 'src/config/environment';
import { RawData, WebSocket } from 'ws';
import { CandleAggregatorService } from './candle-aggregator.service';
import { CandleStoreService } from './candle-store.service';
import { KlineBackfillService } from './kline-backfill.service';
import { MarketKafkaService } from './market-kafka.service';
import {
  Candlestick,
  KLINE_INTERVALS,
  KlineInterval,
  MarketTick,
} from './market.interface';

@Injectable()
export class BinanceIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceIngestionService.name);
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private hasConnectedOnce = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Metrics giám sát pipeline & đo độ trễ thực tế (receivedAt - k.T)
  private ticksReceived = 0;
  private klinesReceived = 0;
  private closedKlinesReceived = 0;
  private lastTickTimestamp: number | null = null;
  private lastKlineLatencyMs: number | null = null;
  private totalKlineLatencyMs = 0;
  private connectionStatus:
    | 'CONNECTED'
    | 'CONNECTING'
    | 'RECONNECTING'
    | 'DISCONNECTED' = 'DISCONNECTED';

  constructor(
    private readonly candleAggregator: CandleAggregatorService,
    private readonly candleStore: CandleStoreService,
    private readonly klineBackfill: KlineBackfillService,
    private readonly kafkaService: MarketKafkaService,
  ) {}

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.disconnect();
  }

  /**
   * Danh sách combined streams: @trade cho mọi symbol + @kline_<interval> cho mọi (symbol, interval).
   * Ví dụ: 3 symbol × (1 trade + 5 kline) = 18 streams (giới hạn Binance: 1024 streams/kết nối).
   */
  buildSubscribedStreams(): string[] {
    const symbols = ENV.BINANCE.SYMBOLS.map((s) => s.toLowerCase());
    const intervals = this.klineBackfill.getConfiguredIntervals();
    const streams: string[] = [];

    for (const sym of symbols) {
      streams.push(`${sym}@trade`);
      for (const interval of intervals) {
        streams.push(`${sym}@kline_${interval}`);
      }
    }

    return streams;
  }

  /**
   * Khởi tạo kết nối WebSocket tới Binance Combined Stream API
   */
  connect() {
    if (this.isDestroyed) return;

    const isReconnect = this.hasConnectedOnce || this.reconnectAttempts > 0;
    this.connectionStatus = isReconnect ? 'RECONNECTING' : 'CONNECTING';

    const streams = this.buildSubscribedStreams();
    const url = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;

    this.logger.log(
      `Connecting to Binance WebSocket (${streams.length} streams: trade + klines [${this.klineBackfill.getConfiguredIntervals().join(', ')}])`,
    );

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        const shouldBackfillGap = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        this.connectionStatus = 'CONNECTED';
        this.reconnectAttempts = 0;
        this.logger.log(
          `Binance WebSocket Connected! Subscribed to [${ENV.BINANCE.SYMBOLS.join(', ')}] × [${this.klineBackfill.getConfiguredIntervals().join(', ')}]`,
        );

        // Nếu vừa kết nối lại sau khi rớt mạng -> vá lỗ hổng nến bị thiếu từ REST
        if (shouldBackfillGap) {
          void this.klineBackfill.backfillGapsAll().catch((err) => {
            this.logger.warn(
              `Reconnect gap backfill error: ${(err as Error).message}`,
            );
          });
        }
      });

      this.ws.on('message', (rawData: RawData) => {
        this.handleMessage(rawData);
      });

      this.ws.on('error', (error) => {
        this.logger.warn(`Binance WebSocket error: ${error.message}`);
      });

      this.ws.on('close', (code, reason) => {
        this.connectionStatus = 'DISCONNECTED';
        this.logger.warn(
          `Binance WebSocket closed (code: ${code}, reason: ${reason.toString() || 'none'}). Reconnecting...`,
        );
        this.scheduleReconnect();
      });

      this.ws.on('ping', () => {
        this.ws?.pong();
      });
    } catch (err) {
      this.logger.error('Error instantiating Binance WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  /**
   * Xử lý gói tin @trade và @kline_<interval> từ Binance Combined Stream
   */
  handleMessage(rawData: RawData) {
    try {
      const parsed = JSON.parse(rawData.toString());
      const data = parsed.data ?? parsed;
      if (!data) return;

      // 1. Luồng khớp lệnh trực tiếp (@trade)
      if (data.e === 'trade') {
        const tick: MarketTick = {
          symbol: data.s,
          price: data.p,
          quantity: data.q,
          timestamp: data.T || data.E,
          tradeId: data.t?.toString(),
          isBuyerMaker: !!data.m,
        };

        this.ticksReceived += 1;
        this.lastTickTimestamp = tick.timestamp;

        // Gom nến 1s cho UI + kích hoạt listeners (Matching Engine, Centrifugo)
        this.candleAggregator.processTick(tick);

        // Bắn tick vào Apache Kafka (dedicated partition by symbol)
        void this.kafkaService.sendTick(tick);
        return;
      }

      // 2. Luồng nến chính chủ từ Binance (@kline_1m, 5m, 15m, 1h, 1d)
      if (data.e === 'kline' && data.k) {
        const k = data.k;
        const interval = k.i as KlineInterval;
        if (!(KLINE_INTERVALS as string[]).includes(interval)) {
          return;
        }

        this.klinesReceived += 1;

        const candle: Candlestick = {
          symbol: String(k.s).toUpperCase(),
          interval,
          openTime: Number(k.t),
          closeTime: Number(k.T),
          open: String(k.o),
          high: String(k.h),
          low: String(k.l),
          close: String(k.c),
          volume: String(k.v),
          tradesCount: Number(k.n || 0),
          isClosed: Boolean(k.x),
        };

        // Cập nhật biểu đồ realtime UI qua Centrifugo (cả nến đang chạy lẫn nến chốt)
        this.candleAggregator.handleExchangeKline(candle);

        // CHỈ đẩy Kafka & lưu trữ lâu dài khi Binance xác nhận nến đã chốt (k.x === true)
        if (candle.isClosed) {
          const latencyMs = Date.now() - candle.closeTime;
          this.closedKlinesReceived += 1;
          this.lastKlineLatencyMs = latencyMs;
          this.totalKlineLatencyMs += latencyMs;

          this.logger.debug(
            `[KlineClosed] ${candle.symbol} ${candle.interval} close=${candle.close} openTime=${candle.openTime} latency=${latencyMs}ms`,
          );

          // Hot path không chặn: đẩy Kafka ngay cho Python worker, ghi RAM + Postgres song song
          void this.kafkaService.sendCandle(candle);
          void this.candleStore.saveClosedCandle(candle);
        }
      }
    } catch (err) {
      this.logger.error('Error parsing Binance stream message:', err);
    }
  }

  /**
   * Lên lịch kết nối lại theo thuật toán Exponential Backoff: min(1000 * 2^attempts, 30000) ms
   */
  private scheduleReconnect() {
    if (this.isDestroyed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.logger.log(
      `Scheduling Binance reconnect attempt #${this.reconnectAttempts} in ${delay}ms...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private disconnect() {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
        this.ws = null;
      } catch (err) {
        this.logger.error('Error during WebSocket disconnect:', err);
      }
    }
  }

  /**
   * Lấy trạng thái hoạt động & thống kê độ trễ kline của Ingestion Service
   */
  getStatus() {
    return {
      status: this.connectionStatus,
      reconnectAttempts: this.reconnectAttempts,
      totalTicksReceived: this.ticksReceived,
      totalKlinesReceived: this.klinesReceived,
      totalClosedKlinesReceived: this.closedKlinesReceived,
      lastKlineLatencyMs: this.lastKlineLatencyMs,
      avgKlineLatencyMs:
        this.closedKlinesReceived > 0
          ? Math.round(this.totalKlineLatencyMs / this.closedKlinesReceived)
          : null,
      lastTickTimestamp: this.lastTickTimestamp,
      lastTickTime: this.lastTickTimestamp
        ? new Date(this.lastTickTimestamp).toISOString()
        : null,
      subscribedSymbols: ENV.BINANCE.SYMBOLS,
      subscribedIntervals: this.klineBackfill.getConfiguredIntervals(),
    };
  }
}
