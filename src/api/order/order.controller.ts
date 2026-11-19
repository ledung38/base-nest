import {
  Body,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiHeader, ApiOperation } from '@nestjs/swagger';
import {
  ApiHandleResponse,
  ApiPaginatedResponse,
} from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { RequestAuth } from 'src/dto/common-request.dto';
import { CreateOrderDto } from 'src/dto/order-dto/create-order.dto';
import { GetOrdersDto, OrderResponseDto } from 'src/dto/order-dto/get-orders.dto';
import { OrderRabbitmqService } from './order-rabbitmq.service';
import { OrderService } from './order.service';

@IsAuthController('orders', 'Orders & RabbitMQ Processing', true)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly rabbitmqService: OrderRabbitmqService,
  ) {}

  @Post('/')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Khóa duy nhất (UUID) cho mỗi lần đặt lệnh để chống click đúp / retry trùng lặp',
    example: 'ord-550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOperation({
    summary: 'Đặt lệnh giao dịch mới (LIMIT / MARKET)',
    description:
      'Kiểm tra Idempotency-Key qua Redis, lưu lệnh QUEUED và đẩy vào RabbitMQ orders.queue để worker khóa số dư ký quỹ bất đồng bộ',
  })
  @ApiHandleResponse({
    summary: 'Submit new trading order',
    type: Object,
    httpStatus: HttpStatus.ACCEPTED,
  })
  async createOrder(
    @Req() req: RequestAuth,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() body: CreateOrderDto,
  ) {
    return await this.orderService.createOrder(
      req.user.userId,
      idempotencyKey,
      body,
    );
  }

  @Get('/')
  @ApiOperation({
    summary: 'Lấy danh sách lệnh giao dịch của tài khoản hiện tại',
    description: 'Hỗ trợ phân trang và lọc theo symbol, side, type, status',
  })
  @ApiPaginatedResponse(OrderResponseDto, 'Get paginated user orders')
  async getOrders(@Req() req: RequestAuth, @Query() query: GetOrdersDto) {
    return await this.orderService.getOrders(req.user.userId, query);
  }

  @Get('/queue-status')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái hàng đợi RabbitMQ (Order Queue Status)',
    description:
      'Giám sát kết nối RabbitMQ, topology (orders.queue, orders.dlq, fintrade.events) và số lượng lệnh đã xử lý',
  })
  @ApiHandleResponse({
    summary: 'Get RabbitMQ order queue status',
    type: Object,
  })
  getQueueStatus() {
    return {
      rabbitmq: this.rabbitmqService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('/:id')
  @ApiOperation({
    summary: 'Xem chi tiết một lệnh giao dịch',
  })
  @ApiHandleResponse({
    summary: 'Get order detail by id',
    type: OrderResponseDto,
  })
  async getOrderById(
    @Req() req: RequestAuth,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.orderService.getOrderById(req.user.userId, id);
  }

  @Delete('/:id')
  @ApiOperation({
    summary: 'Hủy lệnh đang chờ khớp (PENDING / PARTIALLY_FILLED)',
    description:
      'Khóa bản ghi lệnh bằng SELECT FOR UPDATE, đổi trạng thái CANCELLED và mở khóa hoàn tiền về ví khả dụng',
  })
  @ApiHandleResponse({
    summary: 'Cancel open order and unlock balance',
    type: OrderResponseDto,
  })
  async cancelOrder(
    @Req() req: RequestAuth,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return await this.orderService.cancelOrder(req.user.userId, id);
  }
}
