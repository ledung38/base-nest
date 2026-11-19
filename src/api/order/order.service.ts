import { CACHE_MANAGER, CacheStore } from '@nestjs/cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { AccountService } from 'src/api/account/account.service';
import { CandleAggregatorService } from 'src/api/market/candle-aggregator.service';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { CreateOrderDto } from 'src/dto/order-dto/create-order.dto';
import { GetOrdersDto } from 'src/dto/order-dto/get-orders.dto';
import { PageDto, PageMetaDto } from 'src/dto/paginate.dto';
import { Order } from 'src/entities/order.entity';
import { DataSource } from 'typeorm';
import { OrderRabbitmqService } from './order-rabbitmq.service';
import {
  IdempotencyCacheRecord,
  OrderDomainEvent,
  OrderEventRoutingKey,
  OrderQueueMessage,
} from './order.interface';

@Injectable()
export class OrderService implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);
  private readonly IDEMPOTENCY_TTL_SECONDS = 120;
  private readonly MARKET_DATA_STALE_MS = 5000;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: CacheStore,
    private readonly accountService: AccountService,
    private readonly candleAggregator: CandleAggregatorService,
    private readonly rabbitmqService: OrderRabbitmqService,
  ) {}

  async onModuleInit() {
    await this.rabbitmqService.registerOrderConsumer((msg) =>
      this.processQueuedOrder(msg),
    );
  }

  private buildIdempotencyCacheKey(userId: number, key: string): string {
    return `fintrade:idempotency:order:${userId}:${key}`;
  }

  /**
   * Tiếp nhận lệnh giao dịch từ User/Bot:
   * 1. Kiểm tra Idempotency-Key (Redis + DB fallback) chống click đúp
   * 2. Validate nghiệp vụ + Market Data Stale Circuit Breaker
   * 3. Lưu lệnh trạng thái QUEUED và đẩy vào RabbitMQ orders.queue (Publisher Confirms)
   */
  async createOrder(
    userId: number,
    rawIdempotencyKey: string | undefined,
    dto: CreateOrderDto,
  ): Promise<{ order: Order; idempotentReplay: boolean }> {
    const idempotencyKey = rawIdempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc để chống trùng lặp lệnh',
      );
    }
    if (idempotencyKey.length > 64) {
      throw new BadRequestException('Idempotency-Key tối đa 64 ký tự');
    }

    const cacheKey = this.buildIdempotencyCacheKey(userId, idempotencyKey);

    // 1. Kiểm tra Idempotency trong Redis (Fast Path)
    const cached = await this.cacheManager.get<IdempotencyCacheRecord>(cacheKey);
    if (cached) {
      if (cached.status === 'COMPLETED' && cached.order) {
        return { order: cached.order, idempotentReplay: true };
      }
      if (cached.status === 'PROCESSING') {
        throw new ConflictException(
          'Yêu cầu với Idempotency-Key này đang được xử lý, vui lòng không gửi trùng lặp',
        );
      }
    }

    // 2. Kiểm tra dự phòng trong Database (Defense in Depth khi Redis hết TTL)
    const orderRepo = this.dataSource.getRepository(Order);
    const existingOrder = await orderRepo.findOne({
      where: { idempotencyKey },
    });
    if (existingOrder) {
      if (existingOrder.userId !== userId) {
        throw new ConflictException(
          'Idempotency-Key đã được sử dụng bởi một giao dịch khác',
        );
      }
      await this.cacheManager.set(
        cacheKey,
        {
          status: 'COMPLETED',
          orderId: existingOrder.id,
          order: existingOrder,
          updatedAt: Date.now(),
        } as IdempotencyCacheRecord,
        { ttl: this.IDEMPOTENCY_TTL_SECONDS },
      );
      return { order: existingOrder, idempotentReplay: true };
    }

    // 3. Đặt khóa tạm trong Redis để chặn các request song song trùng key
    await this.cacheManager.set(
      cacheKey,
      {
        status: 'PROCESSING',
        updatedAt: Date.now(),
      } as IdempotencyCacheRecord,
      { ttl: this.IDEMPOTENCY_TTL_SECONDS },
    );

    let savedOrder: Order | null = null;

    try {
      // 4. Validate cặp giao dịch
      const symbol = dto.symbol.toUpperCase();
      const symbolInfo = this.candleAggregator
        .getSupportedSymbols()
        .find((item) => item.symbol === symbol);

      if (!symbolInfo) {
        throw new BadRequestException(
          `Cặp giao dịch ${symbol} không được hỗ trợ`,
        );
      }

      // 5. Validate khối lượng bằng BigNumber
      const quantityBN = new BigNumber(dto.quantity);
      if (!quantityBN.isGreaterThan(0)) {
        throw new BadRequestException('Khối lượng đặt lệnh phải lớn hơn 0');
      }

      // 6. Xác định giá hiệu lực & kiểm tra Market Data Circuit Breaker
      let effectivePriceBN: BigNumber;
      if (dto.type === OrderTypeEnum.LIMIT) {
        if (!dto.price) {
          throw new BadRequestException('Lệnh LIMIT bắt buộc phải nhập giá (price)');
        }
        effectivePriceBN = new BigNumber(dto.price);
        if (!effectivePriceBN.isGreaterThan(0)) {
          throw new BadRequestException('Giá đặt lệnh LIMIT phải lớn hơn 0');
        }
      } else {
        // MARKET Order: Bắt buộc kiểm tra độ tươi của dữ liệu thị trường Binance
        const latestTick = this.candleAggregator.getLatestPrice(symbol);
        if (
          !latestTick ||
          Date.now() - latestTick.timestamp > this.MARKET_DATA_STALE_MS
        ) {
          throw new BadRequestException(
            'MARKET_DATA_STALE: Tạm ngừng lệnh MARKET do dữ liệu thị trường chưa sẵn sàng hoặc bị trễ',
          );
        }
        effectivePriceBN = new BigNumber(latestTick.price);
      }

      // 7. Tính toán tài sản cần ký quỹ bằng BigNumber (tuyệt đối không dùng float)
      const lockedCurrency: CurrencyEnum =
        dto.side === OrderSideEnum.BUY
          ? (symbolInfo.quoteCurrency as CurrencyEnum)
          : (symbolInfo.baseCurrency as CurrencyEnum);

      const requiredLockAmount =
        dto.side === OrderSideEnum.BUY
          ? effectivePriceBN.multipliedBy(quantityBN).toFixed(8)
          : quantityBN.toFixed(8);

      // 8. Lưu lệnh ban đầu ở trạng thái QUEUED
      const newOrder = orderRepo.create({
        userId,
        idempotencyKey,
        symbol,
        side: dto.side,
        type: dto.type,
        price: effectivePriceBN.toFixed(8),
        quantity: quantityBN.toFixed(8),
        filledQuantity: '0.00000000',
        lockedCurrency,
        lockedAmount: '0.00000000',
        status: OrderStatusEnum.QUEUED,
        rejectReason: null,
      });

      savedOrder = await orderRepo.save(newOrder);

      // 9. Đẩy vào RabbitMQ orders.queue với Publisher Confirms
      const queuePayload: OrderQueueMessage = {
        orderId: savedOrder.id,
        userId,
        idempotencyKey,
        symbol,
        side: savedOrder.side,
        type: savedOrder.type,
        price: savedOrder.price,
        quantity: savedOrder.quantity,
        lockedCurrency,
        requiredLockAmount,
        enqueuedAt: Date.now(),
      };

      const published = await this.rabbitmqService.publishOrder(queuePayload);
      if (!published) {
        // Xóa lệnh chưa vào được queue để client có thể retry an toàn với cùng Idempotency-Key
        await orderRepo.delete({ id: savedOrder.id });
        savedOrder = null;
        throw new ServiceUnavailableException(
          'Hàng đợi xử lý lệnh (RabbitMQ) tạm thời không khả dụng, vui lòng thử lại',
        );
      }

      // 10. Ghi nhận hoàn tất Idempotency trong Redis
      await this.cacheManager.set(
        cacheKey,
        {
          status: 'COMPLETED',
          orderId: savedOrder.id,
          order: savedOrder,
          updatedAt: Date.now(),
        } as IdempotencyCacheRecord,
        { ttl: this.IDEMPOTENCY_TTL_SECONDS },
      );

      await this.emitOrderEvent('order.queued', savedOrder);

      return { order: savedOrder, idempotentReplay: false };
    } catch (err) {
      // Nếu lỗi xảy ra trước khi đẩy thành công vào RabbitMQ, gỡ khóa Redis để cho phép retry
      if (!savedOrder) {
        await this.cacheManager.del(cacheKey);
      }
      throw err;
    }
  }

  /**
   * RabbitMQ Consumer Worker:
   * Tiêu thụ lệnh từ orders.queue -> Khóa tiền ký quỹ qua AccountService (SELECT FOR UPDATE)
   * -> Chuyển trạng thái sang PENDING (hoặc REJECTED nếu không đủ số dư)
   */
  async processQueuedOrder(
    message: OrderQueueMessage,
  ): Promise<'ACK' | 'DEAD_LETTER'> {
    try {
      let postCommitEvent: OrderDomainEvent | null = null;

      await this.dataSource.transaction(async (manager) => {
        const order = await manager
          .createQueryBuilder(Order, 'ord')
          .setLock('pessimistic_write')
          .where('ord.id = :orderId', { orderId: message.orderId })
          .getOne();

        if (!order) {
          this.logger.warn(
            `Order #${message.orderId} not found during worker processing. Skipping.`,
          );
          return;
        }

        // Idempotent Worker Guard: Tránh xử lý lại message đã xử lý
        if (order.status !== OrderStatusEnum.QUEUED) {
          this.logger.log(
            `Order #${order.id} already in status [${order.status}]. Skipping duplicate delivery.`,
          );
          return;
        }

        try {
          // Gọi AccountService.lockBalance dùng chung transaction & Pessimistic Write Lock
          await this.accountService.lockBalance(
            order.userId,
            message.lockedCurrency,
            message.requiredLockAmount,
            `ORDER-${order.id}`,
            `TX-ORDER-LOCK-${order.id}`,
            manager,
          );

          order.status = OrderStatusEnum.PENDING;
          order.lockedAmount = message.requiredLockAmount;
          order.rejectReason = null;
          await manager.save(Order, order);

          postCommitEvent = this.buildOrderEvent('order.pending', order);
        } catch (err) {
          // Lỗi nghiệp vụ (không đủ số dư / không tìm thấy tài khoản) -> REJECT & ACK (không đẩy vào DLQ)
          if (
            err instanceof BadRequestException ||
            err instanceof NotFoundException
          ) {
            order.status = OrderStatusEnum.REJECTED;
            order.lockedAmount = '0.00000000';
            order.rejectReason = err.message.slice(0, 255);
            await manager.save(Order, order);

            postCommitEvent = this.buildOrderEvent('order.rejected', order);
            return;
          }

          // Lỗi hệ thống bất ngờ (DB disconnect, deadlock...) -> ném ra để rollback & đẩy DLQ
          throw err;
        }
      });

      if (postCommitEvent) {
        await this.rabbitmqService.publishEvent(postCommitEvent);
      }

      return 'ACK';
    } catch (err) {
      this.logger.error(
        `System error processing queued order #${message.orderId}: ${(err as Error).message}`,
      );
      return 'DEAD_LETTER';
    }
  }

  /**
   * Hủy lệnh đang mở (PENDING / PARTIALLY_FILLED) và mở khóa hoàn tiền ký quỹ
   */
  async cancelOrder(userId: number, orderId: number): Promise<Order> {
    const cancelledOrder = await this.dataSource.transaction(async (manager) => {
      const order = await manager
        .createQueryBuilder(Order, 'ord')
        .setLock('pessimistic_write')
        .where('ord.id = :orderId AND ord.user_id = :userId', {
          orderId,
          userId,
        })
        .getOne();

      if (!order) {
        throw new NotFoundException('Không tìm thấy lệnh giao dịch');
      }

      if (order.status === OrderStatusEnum.QUEUED) {
        throw new BadRequestException(
          'Lệnh đang được xử lý trong hàng đợi, vui lòng thử lại sau giây lát',
        );
      }

      if (
        order.status !== OrderStatusEnum.PENDING &&
        order.status !== OrderStatusEnum.PARTIALLY_FILLED
      ) {
        throw new BadRequestException(
          `Không thể hủy lệnh đang ở trạng thái ${order.status}`,
        );
      }

      const remainingLocked = new BigNumber(order.lockedAmount);
      if (remainingLocked.isGreaterThan(0)) {
        await this.accountService.unlockBalance(
          userId,
          order.lockedCurrency,
          remainingLocked.toFixed(8),
          `ORDER-${order.id}`,
          `TX-ORDER-UNLOCK-${order.id}`,
          manager,
        );
      }

      order.status = OrderStatusEnum.CANCELLED;
      order.lockedAmount = '0.00000000';
      return await manager.save(Order, order);
    });

    await this.emitOrderEvent('order.cancelled', cancelledOrder);
    return cancelledOrder;
  }

  /**
   * Lấy danh sách lệnh giao dịch của người dùng (phân trang & lọc)
   */
  async getOrders(
    userId: number,
    query: GetOrdersDto,
  ): Promise<PageDto<Order>> {
    const qb = this.dataSource
      .getRepository(Order)
      .createQueryBuilder('ord')
      .where('ord.user_id = :userId', { userId });

    if (query.symbol) {
      qb.andWhere('ord.symbol = :symbol', {
        symbol: query.symbol.toUpperCase(),
      });
    }
    if (query.side) {
      qb.andWhere('ord.side = :side', { side: query.side });
    }
    if (query.type) {
      qb.andWhere('ord.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('ord.status = :status', { status: query.status });
    }

    qb.orderBy('ord.created_at', query.sortBy || 'DESC')
      .skip(query.skip)
      .take(query.take);

    const [data, itemCount] = await qb.getManyAndCount();
    const pageMeta = new PageMetaDto({ pageOptionsDto: query, itemCount });

    return new PageDto(data, pageMeta);
  }

  /**
   * Lấy chi tiết 1 lệnh giao dịch thuộc quyền sở hữu của người dùng
   */
  async getOrderById(userId: number, orderId: number): Promise<Order> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy lệnh giao dịch');
    }

    return order;
  }

  private buildOrderEvent(
    event: OrderEventRoutingKey,
    order: Order,
  ): OrderDomainEvent {
    return {
      event,
      orderId: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: order.price,
      quantity: order.quantity,
      lockedCurrency: order.lockedCurrency,
      lockedAmount: order.lockedAmount,
      status: order.status,
      rejectReason: order.rejectReason,
      timestamp: Date.now(),
    };
  }

  private async emitOrderEvent(
    event: OrderEventRoutingKey,
    order: Order,
  ): Promise<void> {
    await this.rabbitmqService.publishEvent(this.buildOrderEvent(event, order));
  }
}
