import { OrderSideEnum, OrderTypeEnum } from 'src/constant/trading.enum';
import {
  IsSwaggerEnum,
  IsSwaggerFinancialDecimal,
  IsSwaggerString,
} from 'src/decorator/swagger.decorator';

export class CreateOrderDto {
  @IsSwaggerString({
    default: 'BTCUSDT',
    description: 'Cặp giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)',
  })
  symbol: string;

  @IsSwaggerEnum({
    enum: OrderSideEnum,
    default: OrderSideEnum.BUY,
    description: 'Chiều giao dịch (BUY hoặc SELL)',
  })
  side: OrderSideEnum;

  @IsSwaggerEnum({
    enum: OrderTypeEnum,
    default: OrderTypeEnum.LIMIT,
    description: 'Loại lệnh (LIMIT hoặc MARKET)',
  })
  type: OrderTypeEnum;

  @IsSwaggerFinancialDecimal(
    {
      default: '65000.00000000',
      description: 'Giá đặt lệnh (bắt buộc đối với lệnh LIMIT, tùy chọn với MARKET)',
    },
    false,
  )
  price?: string;

  @IsSwaggerFinancialDecimal({
    default: '0.10000000',
    description: 'Khối lượng tài sản cơ sở (ví dụ: 0.1 BTC)',
  })
  quantity: string;
}
