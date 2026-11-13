import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { GetCandlesDto } from 'src/dto/market-dto/get-candles.dto';
import { BinanceIngestionService } from './binance-ingestion.service';
import { CandleAggregatorService } from './candle-aggregator.service';
import { MarketKafkaService } from './market-kafka.service';

@ApiTags('Market Data & Streaming (Binance & Kafka)')
@Controller('market')
export class MarketController {
  constructor(
    private readonly candleAggregator: CandleAggregatorService,
    private readonly binanceIngestion: BinanceIngestionService,
    private readonly kafkaService: MarketKafkaService,
  ) {}

  @Get('/symbols')
  @ApiOperation({
    summary: 'Danh sách các cặp giao dịch được hỗ trợ',
    description: 'Danh sách các cặp tiền (BTCUSDT, ETHUSDT, SOLUSDT) kèm quy cách thập phân',
  })
  @ApiHandleResponse({
    summary: 'Get supported symbols',
    type: Object,
  })
  getSupportedSymbols() {
    return this.candleAggregator.getSupportedSymbols();
  }

  @Get('/ticker/:symbol')
  @ApiOperation({
    summary: 'Lấy giá khớp mới nhất của một cặp giao dịch',
    description: 'Trả về thông tin tick mới nhất nhận từ Binance WebSocket',
  })
  @ApiHandleResponse({
    summary: 'Get latest ticker by symbol',
    type: Object,
  })
  getLatestTicker(@Param('symbol') symbol: string) {
    return this.candleAggregator.getLatestPrice(symbol);
  }

  @Get('/tickers')
  @ApiOperation({
    summary: 'Lấy toàn bộ giá khớp mới nhất của tất cả các cặp giao dịch',
    description: 'Bảng giá realtime tóm tắt của toàn bộ thị trường',
  })
  @ApiHandleResponse({
    summary: 'Get all latest tickers',
    type: Object,
  })
  getAllLatestTickers() {
    return this.candleAggregator.getAllLatestPrices();
  }

  @Get('/candles')
  @ApiOperation({
    summary: 'Lấy dữ liệu nến (OHLCV) để vẽ đồ thị TradingView',
    description: 'Lấy nến thời gian thực được gom bởi In-Memory Rolling Aggregator (1s, 1m, 15m)',
  })
  @ApiHandleResponse({
    summary: 'Get candlesticks for charting',
    type: Object,
  })
  getCandles(@Query() query: GetCandlesDto) {
    return this.candleAggregator.getCandles(
      query.symbol,
      query.interval,
      query.limit,
    );
  }

  @Get('/pipeline-status')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái đường truyền dữ liệu (Pipeline Status)',
    description: 'Giám sát kết nối Binance WebSocket và Apache Kafka Producer',
  })
  @ApiHandleResponse({
    summary: 'Get pipeline health and statistics',
    type: Object,
  })
  getPipelineStatus() {
    return {
      binanceIngestion: this.binanceIngestion.getStatus(),
      kafkaPipeline: this.kafkaService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}

