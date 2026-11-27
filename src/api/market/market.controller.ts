import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { GetCandlesDto } from 'src/dto/market-dto/get-candles.dto';
import { GetKlinesDto } from 'src/dto/market-dto/get-klines.dto';
import { BinanceIngestionService } from './binance-ingestion.service';
import { CandleAggregatorService } from './candle-aggregator.service';
import { CandleStoreService } from './candle-store.service';
import { KlineBackfillService } from './kline-backfill.service';
import { MarketKafkaService } from './market-kafka.service';
import { KlineInterval } from './market.interface';

@ApiTags('Market Data & Streaming (Binance & Kafka)')
@Controller('market')
export class MarketController {
  constructor(
    private readonly candleAggregator: CandleAggregatorService,
    private readonly candleStore: CandleStoreService,
    private readonly klineBackfill: KlineBackfillService,
    private readonly binanceIngestion: BinanceIngestionService,
    private readonly kafkaService: MarketKafkaService,
  ) {}

  @Get('/symbols')
  @ApiOperation({
    summary: 'Danh sách các cặp giao dịch được hỗ trợ',
    description:
      'Danh sách các cặp tiền (BTCUSDT, ETHUSDT, SOLUSDT) kèm quy cách thập phân',
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
    description:
      '1s lấy từ tick aggregator; 1m/5m/15m/1h/1d lấy nến chốt từ CandleStore kèm nến đang chạy cho biểu đồ UI',
  })
  @ApiHandleResponse({
    summary: 'Get candlesticks for charting',
    type: Object,
  })
  async getCandles(@Query() query: GetCandlesDto) {
    const interval = query.interval || '5m';
    const limit = query.limit || 100;

    if (interval === '1s') {
      return this.candleAggregator.getCandles(query.symbol, '1s', limit);
    }

    const closed = await this.candleStore.getClosedCandles(
      query.symbol,
      interval as KlineInterval,
      limit,
    );
    const active = this.candleAggregator.getActiveCandle(query.symbol, interval);
    if (
      active &&
      (closed.length === 0 ||
        active.openTime > closed[closed.length - 1].openTime)
    ) {
      return [...closed, active].slice(-limit);
    }
    return closed;
  }

  @Get('/klines')
  @ApiOperation({
    summary: 'Lấy nến ĐÃ CHỐT (Closed Klines) chuẩn Binance cho Quant Worker warm-up',
    description:
      'Chỉ trả về nến isClosed=true (đọc O(1) từ RAM 1000 nến hoặc fallback PostgreSQL), tăng dần theo openTime, khớp 1:1 với backtest',
  })
  @ApiHandleResponse({
    summary: 'Get closed historical klines for quant warm-up',
    type: Object,
  })
  async getClosedKlines(@Query() query: GetKlinesDto) {
    return this.candleStore.getClosedCandles(
      query.symbol,
      (query.interval || '5m') as KlineInterval,
      query.limit || 1000,
      query.endTime,
    );
  }

  @Get('/pipeline-status')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái đường truyền dữ liệu (Pipeline Status)',
    description:
      'Giám sát kết nối Binance WebSocket, độ trễ kline, trạng thái warm-up/backfill, RAM buffer và Kafka Producer',
  })
  @ApiHandleResponse({
    summary: 'Get pipeline health and statistics',
    type: Object,
  })
  getPipelineStatus() {
    return {
      binanceIngestion: this.binanceIngestion.getStatus(),
      klineBackfill: this.klineBackfill.getStatus(),
      candleStore: this.candleStore.getStats(),
      kafkaPipeline: this.kafkaService.getStatus(),
      timestamp: new Date().toISOString(),
    };
  }
}
