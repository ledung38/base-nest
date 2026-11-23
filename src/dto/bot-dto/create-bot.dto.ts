import { IsBoolean, IsNotEmpty, IsObject, IsOptional } from 'class-validator';
import { BotTypeEnum } from 'src/constant/trading.enum';
import {
  IsSwaggerBoolean,
  IsSwaggerEnum,
  IsSwaggerString,
} from 'src/decorator/swagger.decorator';

export class CreateBotDto {
  @IsSwaggerString({
    default: 'BTC Alpha Grid Bot',
    description: 'Tên định danh của bot thuật toán',
  })
  @IsNotEmpty()
  name: string;

  @IsSwaggerEnum({
    enum: BotTypeEnum,
    default: BotTypeEnum.GRID_TRADING,
    description: 'Loại chiến lược thuật toán (GRID_TRADING hoặc EMA_CROSS)',
  })
  botType: BotTypeEnum;

  @IsSwaggerString({
    default: 'BTCUSDT',
    description: 'Cặp coin giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)',
  })
  @IsNotEmpty()
  symbol: string;

  @IsObject()
  @IsNotEmpty()
  parameters: Record<string, any>;

  @IsSwaggerBoolean(
    {
      default: false,
      description: 'Tự động kích hoạt bot ngay sau khi tạo',
    },
    false,
  )
  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}
