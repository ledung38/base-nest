import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketModule } from 'src/api/market/market.module';
import { OrderModule } from 'src/api/order/order.module';
import { BotConfig } from 'src/entities/bot-config.entity';
import { BotController } from './bot.controller';
import { BotService } from './bot.service';
import { EmaCrossWorker } from './workers/ema-cross.worker';
import { GridTradingWorker } from './workers/grid-trading.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotConfig]),
    OrderModule,
    MarketModule,
  ],
  controllers: [BotController],
  providers: [BotService, GridTradingWorker, EmaCrossWorker],
  exports: [BotService, GridTradingWorker, EmaCrossWorker],
})
export class BotModule {}
