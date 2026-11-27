import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketCandle } from 'src/entities/market-candle.entity';
import { BinanceIngestionService } from './binance-ingestion.service';
import { BinanceRestService } from './binance-rest.service';
import { CandleAggregatorService } from './candle-aggregator.service';
import { CandleStoreService } from './candle-store.service';
import { KlineBackfillService } from './kline-backfill.service';
import { MarketKafkaService } from './market-kafka.service';
import { MarketController } from './market.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MarketCandle])],
  controllers: [MarketController],
  providers: [
    CandleAggregatorService,
    CandleStoreService,
    BinanceRestService,
    KlineBackfillService,
    MarketKafkaService,
    BinanceIngestionService,
  ],
  exports: [
    CandleAggregatorService,
    CandleStoreService,
    BinanceRestService,
    KlineBackfillService,
    MarketKafkaService,
    BinanceIngestionService,
  ],
})
export class MarketModule {}
