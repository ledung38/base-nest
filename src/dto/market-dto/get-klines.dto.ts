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
import { KLINE_INTERVALS, KlineInterval } from 'src/api/market/market.interface';

export class GetKlinesDto {
  @ApiProperty({
    default: 'BTCUSDT',
    description: 'Cặp giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)',
  })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiPropertyOptional({
    enum: KLINE_INTERVALS,
    default: '5m',
    description: 'Khung thời gian nến chuẩn Binance (1m, 5m, 15m, 1h, 1d)',
  })
  @IsOptional()
  @IsEnum(KLINE_INTERVALS)
  interval?: KlineInterval = '5m';

  @ApiPropertyOptional({
    default: 1000,
    minimum: 1,
    maximum: 1000,
    description: 'Số lượng nến ĐÃ CHỐT tối đa (mặc định 1000 để warm-up TA-Lib)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 1000;

  @ApiPropertyOptional({
    description: 'Epoch ms kết thúc (chỉ lấy nến có openTime <= endTime)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  endTime?: number;
}
