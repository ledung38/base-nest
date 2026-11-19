import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { ENV } from 'src/config/environment';
import { Candlestick, MarketTick } from './market.interface';

/**
 * Bảng ánh xạ cố định Symbol -> Partition Index (Dedicated Partition Mapping).
 * Đảm bảo 100% Deterministic: Mỗi cặp coin sở hữu trọn vẹn 1 partition độc lập,
 * loại trừ triệt để tình trạng va chạm hash Murmur2 (vốn khiến 2 coin dồn vào 1 partition và 1 partition bị rỗng).
 */
export const SYMBOL_PARTITIONS: Record<string, number> = {
  BTCUSDT: 0,
  ETHUSDT: 1,
  SOLUSDT: 2,
};

/**
 * Trả về Partition Index tương ứng cho từng Symbol.
 * Nếu là symbol chuẩn đã cấu hình: trả về index cố định (0, 1, 2).
 * Nếu là symbol lạ/chưa cấu hình: fallback băm DJB2 chia lấy dư cho tổng số partition.
 */
export function getPartitionForSymbol(symbol: string, totalPartitions = 3): number {
  const upper = symbol.toUpperCase().trim();
  if (upper in SYMBOL_PARTITIONS) {
    return SYMBOL_PARTITIONS[upper];
  }

  let hash = 5381;
  for (let i = 0; i < upper.length; i++) {
    hash = ((hash << 5) + hash + upper.charCodeAt(i)) >>> 0;
  }
  return hash % totalPartitions;
}

@Injectable()
export class MarketKafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketKafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private isConnected = false;
  private isConnecting = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: ENV.KAFKA.CLIENT_ID,
      brokers: ENV.KAFKA.BROKERS,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      idempotent: false,
    });
  }

  async onModuleInit() {
    await this.connectProducer();
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      try {
        await this.producer.disconnect();
        this.isConnected = false;
        this.logger.log('Kafka Producer disconnected cleanly.');
      } catch (err) {
        this.logger.error('Error disconnecting Kafka producer:', err);
      }
    }
  }

  /**
   * Kết nối tới Kafka Producer một cách an toàn, không làm crash app nếu broker chưa sẵn sàng
   */
  async connectProducer(): Promise<boolean> {
    if (this.isConnected || this.isConnecting) return this.isConnected;
    this.isConnecting = true;

    try {
      await this.producer.connect();
      this.isConnected = true;
      this.logger.log(
        `Kafka Producer successfully connected to [${ENV.KAFKA.BROKERS.join(', ')}]`,
      );
      return true;
    } catch (error) {
      this.isConnected = false;
      this.logger.warn(
        `Kafka broker offline or not reachable at [${ENV.KAFKA.BROKERS.join(', ')}]. Operating in fallback mode.`,
      );
      return false;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Đẩy dữ liệu tick vào Kafka topic 'market.ticks'
   * QUAN TRỌNG: Gán trực tiếp partition theo Symbol để đảm bảo mỗi đồng coin
   * độc quyền 1 partition riêng, tải phân bổ đều tuyệt đối và bảo toàn thứ tự thời gian!
   */
  async sendTick(tick: MarketTick): Promise<void> {
    if (!this.isConnected) return;

    try {
      const partition = getPartitionForSymbol(tick.symbol);
      await this.producer.send({
        topic: ENV.KAFKA.TOPICS.MARKET_TICKS,
        messages: [
          {
            partition,
            key: tick.symbol,
            value: JSON.stringify(tick),
            timestamp: tick.timestamp.toString(),
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Failed to publish tick for ${tick.symbol} to Kafka:`, err);
    }
  }

  /**
   * Đẩy nến đã hoàn thành vào Kafka topic 'market.candles'
   * Partition được gán theo candle.symbol để consumer gom nến theo từng coin độc lập.
   */
  async sendCandle(candle: Candlestick): Promise<void> {
    if (!this.isConnected) return;

    try {
      const partition = getPartitionForSymbol(candle.symbol);
      await this.producer.send({
        topic: ENV.KAFKA.TOPICS.MARKET_CANDLES,
        messages: [
          {
            partition,
            key: `${candle.symbol}_${candle.interval}`,
            value: JSON.stringify(candle),
            timestamp: candle.closeTime.toString(),
          },
        ],
      });
    } catch (err) {
      this.logger.error(`Failed to publish candle for ${candle.symbol}:`, err);
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      brokers: ENV.KAFKA.BROKERS,
      topics: ENV.KAFKA.TOPICS,
    };
  }
}

