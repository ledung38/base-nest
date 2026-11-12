import { ApiProperty } from '@nestjs/swagger';
import { CurrencyEnum } from 'src/constant/trading.enum';

export class AccountBalanceItemResponse {
  @ApiProperty()
  id: number;

  @ApiProperty({ enum: CurrencyEnum })
  currency: CurrencyEnum;

  @ApiProperty({ example: '10000.00000000' })
  availableBalance: string;

  @ApiProperty({ example: '0.00000000' })
  lockedBalance: string;

  @ApiProperty({ example: '10000.00000000' })
  totalBalance: string;

  @ApiProperty()
  updatedAt: Date;
}

export class GetBalancesResponse {
  @ApiProperty({ type: [AccountBalanceItemResponse] })
  balances: AccountBalanceItemResponse[];
}

