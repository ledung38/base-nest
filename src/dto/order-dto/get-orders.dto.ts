import { ApiProperty } from '@nestjs/swagger';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import { IsSwaggerEnum, IsSwaggerString } from 'src/decorator/swagger.decorator';
import { PageOptionsDto } from '../paginate.dto';

export class GetOrdersDto extends PageOptionsDto {
  @IsSwaggerString({ description: 'Lọc theo cặp giao dịch (BTCUSDT, ETHUSDT, SOLUSDT)' }, false)
  symbol?: string;

  @IsSwaggerEnum({ enum: OrderSideEnum, description: 'Lọc theo chiều BUY/SELL' }, false)
  side?: OrderSideEnum;

  @IsSwaggerEnum({ enum: OrderTypeEnum, description: 'Lọc theo loại LIMIT/MARKET' }, false)
  type?: OrderTypeEnum;

  @IsSwaggerEnum({ enum: OrderStatusEnum, description: 'Lọc theo trạng thái lệnh' }, false)
  status?: OrderStatusEnum;
}

export class OrderResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  idempotencyKey: string;

  @ApiProperty({ example: 'BTCUSDT' })
  symbol: string;

  @ApiProperty({ enum: OrderSideEnum })
  side: OrderSideEnum;

  @ApiProperty({ enum: OrderTypeEnum })
  type: OrderTypeEnum;

  @ApiProperty({ example: '65000.00000000' })
  price: string;

  @ApiProperty({ example: '0.10000000' })
  quantity: string;

  @ApiProperty({ example: '0.00000000' })
  filledQuantity: string;

  @ApiProperty({ enum: CurrencyEnum })
  lockedCurrency: CurrencyEnum;

  @ApiProperty({ example: '6500.00000000' })
  lockedAmount: string;

  @ApiProperty({ enum: OrderStatusEnum })
  status: OrderStatusEnum;

  @ApiProperty({ nullable: true })
  rejectReason: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
