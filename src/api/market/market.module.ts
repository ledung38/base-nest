import { Module } from '@nestjs/common';
import { BinanceIngestionService } from './binance-ingestion.service';
import { CandleAggregatorService } from './candle-aggregator.service';
import { MarketKafkaService } from './market-kafka.service';
import { MarketController } from './market.controller';

@Module({
  controllers: [MarketController],
  providers: [
    CandleAggregatorService,
    MarketKafkaService,
    BinanceIngestionService,
  ],
  exports: [
    CandleAggregatorService,
    MarketKafkaService,
    BinanceIngestionService,
  ],
})
export class MarketModule {}

