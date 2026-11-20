import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  Channel,
  ConfirmChannel,
  Connection,
  ConsumeMessage,
  connect,
} from 'amqplib';
import { ENV } from 'src/config/environment';
import {
  AnyDomainEvent,
  OrderDomainEvent,
  OrderQueueHandler,
  OrderQueueMessage,
} from './order.interface';

interface EventConsumerRegistration {
  queueName: string;
  bindingPattern: string;
  handler: (routingKey: string, payload: any) => Promise<void>;
}

@Injectable()
export class OrderRabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderRabbitmqService.name);
  private readonly dlxName = 'orders.dlx';
  private readonly consumerPrefetch = 10;

  private connection: Connection | null = null;
  private confirmChannel: ConfirmChannel | null = null;
  private consumerChannel: Channel | null = null;
  private orderHandler: OrderQueueHandler | null = null;
  private eventConsumers: EventConsumerRegistration[] = [];

  private isConnected = false;
  private isDestroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  private totalPublished = 0;
  private totalConsumed = 0;
  private totalDeadLettered = 0;

  async onModuleInit() {
    await this.connectBroker();
  }

  async onModuleDestroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    await this.closeConnections();
  }

  /**
   * Đăng ký worker handler xử lý message từ orders.queue
   */
  async registerOrderConsumer(handler: OrderQueueHandler): Promise<void> {
    this.orderHandler = handler;
    if (this.isConnected && this.consumerChannel) {
      await this.startConsuming();
    }
  }

  /**
   * Kết nối RabbitMQ, khai báo Topology (Durable Queue + DLX/DLQ + Topic Exchange)
   */
  async connectBroker(): Promise<boolean> {
    if (this.isDestroyed || this.isConnected) return this.isConnected;

    try {
      const conn = await connect(ENV.RABBITMQ.URI);
      this.connection = conn;

      conn.on('error', (err) => {
        this.logger.warn(`RabbitMQ connection error: ${err.message}`);
      });

      conn.on('close', () => {
        this.isConnected = false;
        this.confirmChannel = null;
        this.consumerChannel = null;
        if (!this.isDestroyed) {
          this.logger.warn('RabbitMQ connection closed. Scheduling reconnect...');
          this.scheduleReconnect();
        }
      });

      // 1. Khởi tạo Publisher Confirm Channel
      this.confirmChannel = await conn.createConfirmChannel();

      // 2. Khởi tạo Consumer Channel với prefetch kiểm soát Backpressure
      this.consumerChannel = await conn.createChannel();
      await this.consumerChannel.prefetch(this.consumerPrefetch);

      // 3. Khai báo Topology (Idempotent)
      await this.assertTopology(this.confirmChannel);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log(
        `RabbitMQ connected! Topology ready: queue=[${ENV.RABBITMQ.ORDER_QUEUE}], dlq=[${ENV.RABBITMQ.ORDER_DLQ}], exchange=[${ENV.RABBITMQ.EVENT_EXCHANGE}]`,
      );

      // 4. Nếu worker handler đã đăng ký, kích hoạt consumer ngay
      if (this.orderHandler) {
        await this.startConsuming();
      }

      // 5. Khởi động lại các event consumer đã đăng ký (Idempotent)
      for (const reg of this.eventConsumers) {
        await this.startEventConsumer(reg);
      }

      return true;
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(
        `RabbitMQ broker unavailable at [${ENV.RABBITMQ.URI}]. Retrying in background...`,
      );
      this.scheduleReconnect();
      return false;
    }
  }

  /**
   * Khai báo DLX, DLQ, Main Durable Queue và Topic Exchange
   */
  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    // Dead Letter Exchange & Queue
    await channel.assertExchange(this.dlxName, 'direct', { durable: true });
    await channel.assertQueue(ENV.RABBITMQ.ORDER_DLQ, { durable: true });
    await channel.bindQueue(
      ENV.RABBITMQ.ORDER_DLQ,
      this.dlxName,
      ENV.RABBITMQ.ORDER_DLQ,
    );

    // Main Order Queue (Durable + DLX routing)
    await channel.assertQueue(ENV.RABBITMQ.ORDER_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': this.dlxName,
        'x-dead-letter-routing-key': ENV.RABBITMQ.ORDER_DLQ,
      },
    });

    // Domain Events Exchange (cho Pha 5 Matching Engine & Pha 6 Centrifugo)
    await channel.assertExchange(ENV.RABBITMQ.EVENT_EXCHANGE, 'topic', {
      durable: true,
    });
  }

  /**
   * Bắt đầu tiêu thụ lệnh từ orders.queue với Manual Ack
   */
  private async startConsuming(): Promise<void> {
    if (!this.consumerChannel || !this.orderHandler) return;

    const channel = this.consumerChannel;
    const handler = this.orderHandler;

    await channel.consume(
      ENV.RABBITMQ.ORDER_QUEUE,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const payload: OrderQueueMessage = JSON.parse(msg.content.toString());
          const result = await handler(payload);

          if (result === 'ACK') {
            channel.ack(msg);
            this.totalConsumed += 1;
          } else {
            // Đẩy sang Dead Letter Queue (requeue = false)
            channel.nack(msg, false, false);
            this.totalDeadLettered += 1;
          }
        } catch (err) {
          this.logger.error(
            `Unhandled error processing order message, routing to DLQ: ${(err as Error).message}`,
          );
          channel.nack(msg, false, false);
          this.totalDeadLettered += 1;
        }
      },
      { noAck: false },
    );

    this.logger.log(
      `Order consumer active on [${ENV.RABBITMQ.ORDER_QUEUE}] (prefetch=${this.consumerPrefetch}, manualAck=true)`,
    );
  }

  /**
   * Đẩy lệnh vào RabbitMQ với Publisher Confirms & Persistent Delivery Mode
   */
  async publishOrder(payload: OrderQueueMessage): Promise<boolean> {
    if (!this.isConnected || !this.confirmChannel) {
      return false;
    }

    const buffer = Buffer.from(JSON.stringify(payload));
    this.confirmChannel.sendToQueue(ENV.RABBITMQ.ORDER_QUEUE, buffer, {
      persistent: true,
      contentType: 'application/json',
      messageId: payload.idempotencyKey,
      timestamp: Date.now(),
    });

    await this.confirmChannel.waitForConfirms();
    this.totalPublished += 1;
    return true;
  }

  /**
   * Phát sự kiện miền (order.pending, order.rejected, order.cancelled, trade.executed) lên Topic Exchange
   */
  async publishEvent(event: AnyDomainEvent): Promise<void> {
    if (!this.isConnected || !this.confirmChannel) return;

    try {
      const buffer = Buffer.from(JSON.stringify(event));
      this.confirmChannel.publish(
        ENV.RABBITMQ.EVENT_EXCHANGE,
        event.event,
        buffer,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: event.timestamp,
        },
      );
      await this.confirmChannel.waitForConfirms();
    } catch (err) {
      this.logger.warn(
        `Failed to publish domain event [${event.event}]: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Đăng ký consumer lắng nghe Domain Events từ Topic Exchange 'fintrade.events'
   * Ví dụ: queueName = 'matching.events.queue', pattern = 'order.*'
   */
  async registerEventConsumer(
    queueName: string,
    bindingPattern: string,
    handler: (routingKey: string, payload: any) => Promise<void>,
  ): Promise<void> {
    const registration: EventConsumerRegistration = {
      queueName,
      bindingPattern,
      handler,
    };
    this.eventConsumers.push(registration);

    if (this.isConnected && this.connection) {
      await this.startEventConsumer(registration);
    }
  }

  private async startEventConsumer(
    registration: EventConsumerRegistration,
  ): Promise<void> {
    if (!this.connection) return;

    try {
      const channel = await this.connection.createChannel();
      await channel.prefetch(20);
      await channel.assertQueue(registration.queueName, { durable: true });
      await channel.bindQueue(
        registration.queueName,
        ENV.RABBITMQ.EVENT_EXCHANGE,
        registration.bindingPattern,
      );

      await channel.consume(
        registration.queueName,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return;
          try {
            const routingKey = msg.fields.routingKey;
            const payload = JSON.parse(msg.content.toString());
            await registration.handler(routingKey, payload);
            channel.ack(msg);
          } catch (err) {
            this.logger.error(
              `Error handling domain event [${msg.fields.routingKey}] in queue [${registration.queueName}]: ${(err as Error).message}`,
            );
            // NACK và không requeue để tránh poison message vòng lặp
            channel.nack(msg, false, false);
          }
        },
        { noAck: false },
      );

      this.logger.log(
        `Event consumer ready on queue=[${registration.queueName}], pattern=[${registration.bindingPattern}]`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to start event consumer for queue [${registration.queueName}]: ${(err as Error).message}`,
      );
    }
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.connectBroker();
    }, delay);
  }

  private async closeConnections() {
    try {
      if (this.consumerChannel) {
        await this.consumerChannel.close();
        this.consumerChannel = null;
      }
      if (this.confirmChannel) {
        await this.confirmChannel.close();
        this.confirmChannel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.isConnected = false;
    } catch (err) {
      this.logger.error('Error closing RabbitMQ connections:', err);
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      topology: {
        orderQueue: ENV.RABBITMQ.ORDER_QUEUE,
        deadLetterExchange: this.dlxName,
        deadLetterQueue: ENV.RABBITMQ.ORDER_DLQ,
        eventExchange: ENV.RABBITMQ.EVENT_EXCHANGE,
        prefetch: this.consumerPrefetch,
      },
      metrics: {
        totalPublished: this.totalPublished,
        totalConsumed: this.totalConsumed,
        totalDeadLettered: this.totalDeadLettered,
      },
    };
  }
}
