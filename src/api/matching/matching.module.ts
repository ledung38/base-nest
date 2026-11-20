import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from 'src/api/account/account.module';
import { MarketModule } from 'src/api/market/market.module';
import { OrderModule } from 'src/api/order/order.module';
import { Order } from 'src/entities/order.entity';
import { Trade } from 'src/entities/trade.entity';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trade, Order]),
    AccountModule,
    MarketModule,
    OrderModule,
  ],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
