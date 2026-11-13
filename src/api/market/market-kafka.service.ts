import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { ENV } from 'src/config/environment';
import { Candlestick, MarketTick } from './market.interface';

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
   * QUAN TRỌNG: Key = tick.symbol để đảm bảo mọi tick của cùng 1 đồng coin
   * luôn đi vào cùng 1 partition duy nhất (Bảo toàn thứ tự thời gian)!
   */
  async sendTick(tick: MarketTick): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.producer.send({
        topic: ENV.KAFKA.TOPICS.MARKET_TICKS,
        messages: [
          {
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
   */
  async sendCandle(candle: Candlestick): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.producer.send({
        topic: ENV.KAFKA.TOPICS.MARKET_CANDLES,
        messages: [
          {
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

