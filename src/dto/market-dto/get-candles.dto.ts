import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CandleInterval, KLINE_INTERVALS } from 'src/api/market/market.interface';

export class GetCandlesDto {
  @ApiProperty({
    default: 'BTCUSDT',
    description: 'Cặp giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)',
  })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiPropertyOptional({
    enum: ['1s', ...KLINE_INTERVALS],
    default: '5m',
    description: 'Khung thời gian nến (1s từ tick; 1m, 5m, 15m, 1h, 1d từ Binance Klines)',
  })
  @IsOptional()
  @IsEnum(['1s', ...KLINE_INTERVALS])
  interval?: CandleInterval = '5m';

  @ApiPropertyOptional({
    default: 100,
    minimum: 1,
    maximum: 1000,
    description: 'Số lượng nến tối đa muốn lấy (tối đa 1000)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 100;
}
