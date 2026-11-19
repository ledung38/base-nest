import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from 'src/api/account/account.module';
import { MarketModule } from 'src/api/market/market.module';
import { Order } from 'src/entities/order.entity';
import { OrderRabbitmqService } from './order-rabbitmq.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), AccountModule, MarketModule],
  controllers: [OrderController],
  providers: [OrderRabbitmqService, OrderService],
  exports: [OrderService, OrderRabbitmqService],
})
export class OrderModule {}
