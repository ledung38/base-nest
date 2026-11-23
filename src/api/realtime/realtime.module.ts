import { Module } from '@nestjs/common';
import { MarketModule } from 'src/api/market/market.module';
import { MatchingModule } from 'src/api/matching/matching.module';
import { OrderModule } from 'src/api/order/order.module';
import { RealtimeConsumerService } from './realtime-consumer.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';
import { OrderbookThrottler } from './throttler/orderbook-throttler';

@Module({
  imports: [MarketModule, MatchingModule, OrderModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, OrderbookThrottler, RealtimeConsumerService],
  exports: [RealtimeService, OrderbookThrottler],
})
export class RealtimeModule {}
