import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ENV } from 'src/config/environment';
import WebSocket from 'ws';
import { CandleAggregatorService } from './candle-aggregator.service';
import { MarketKafkaService } from './market-kafka.service';
import { MarketTick } from './market.interface';

@Injectable()
export class BinanceIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceIngestionService.name);
  private ws: WebSocket | null = null;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Thống kê metrics phục vụ giám sát và phỏng vấn
  private ticksReceived = 0;
  private lastTickTimestamp: number | null = null;
  private connectionStatus: 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' =
    'DISCONNECTED';

  constructor(
    private readonly candleAggregator: CandleAggregatorService,
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
   * Khởi tạo kết nối WebSocket tới Binance Public Stream API
   */
  connect() {
    if (this.isDestroyed) return;

    this.connectionStatus = this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING';

    const streams = ENV.BINANCE.SYMBOLS.map(
      (s) => `${s.toLowerCase()}@trade`,
    ).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    this.logger.log(`Connecting to Binance WebSocket: ${url}`);

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this.connectionStatus = 'CONNECTED';
        this.reconnectAttempts = 0;
        this.logger.log(
          `Binance WebSocket Connected successfully! Subscribed to [${ENV.BINANCE.SYMBOLS.join(', ')}]`,
        );
      });

      this.ws.on('message', (rawData: WebSocket.RawData) => {
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
   * Xử lý gói tin trade stream từ Binance
   */
  private handleMessage(rawData: WebSocket.RawData) {
    try {
      const parsed = JSON.parse(rawData.toString());
      const data = parsed.data;

      // Binance trade payload: e = 'trade'
      if (data && data.e === 'trade') {
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

        // 1. Cập nhật In-memory Candle Aggregator
        const { closedCandles } = this.candleAggregator.processTick(tick);

        // 2. Bắn tick vào Apache Kafka (partitioned by symbol)
        this.kafkaService.sendTick(tick);

        // 3. Nếu có nến vừa hoàn thành, bắn vào Kafka topic 'market.candles'
        for (const candle of closedCandles) {
          this.kafkaService.sendCandle(candle);
        }
      }
    } catch (err) {
      this.logger.error('Error parsing Binance stream message:', err);
    }
  }

  /**
   * Lên lịch kết nối lại theo thuật toán Exponential Backoff
   * Thời gian chờ: min(1000 * 2^attempts, 30000) ms
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
   * Lấy trạng thái hoạt động của Ingestion Service
   */
  getStatus() {
    return {
      status: this.connectionStatus,
      reconnectAttempts: this.reconnectAttempts,
      totalTicksReceived: this.ticksReceived,
      lastTickTimestamp: this.lastTickTimestamp,
      lastTickTime: this.lastTickTimestamp
        ? new Date(this.lastTickTimestamp).toISOString()
        : null,
      subscribedSymbols: ENV.BINANCE.SYMBOLS,
    };
  }
}

