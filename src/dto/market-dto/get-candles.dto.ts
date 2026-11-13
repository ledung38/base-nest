import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { CandleInterval } from 'src/api/market/market.interface';

export class GetCandlesDto {
  @ApiProperty({
    default: 'BTCUSDT',
    description: 'Cặp giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)',
  })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiPropertyOptional({
    enum: ['1s', '1m', '15m'],
    default: '1m',
    description: 'Khung thời gian nến (1s, 1m, 15m)',
  })
  @IsOptional()
  @IsEnum(['1s', '1m', '15m'])
  interval?: CandleInterval = '1m';

  @ApiPropertyOptional({
    default: 100,
    minimum: 1,
    maximum: 500,
    description: 'Số lượng nến tối đa muốn lấy',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

