import { CurrencyEnum } from 'src/constant/trading.enum';
import {
  IsSwaggerEnum,
  IsSwaggerFinancialDecimal,
} from 'src/decorator/swagger.decorator';

export class DepositFaucetDto {
  @IsSwaggerEnum({
    enum: CurrencyEnum,
    default: CurrencyEnum.USDT,
    description: 'Loại tiền tệ cần nạp (USDT, BTC, ETH, SOL)',
  })
  currency: CurrencyEnum;

  @IsSwaggerFinancialDecimal({
    default: '10000.00000000',
    description: 'Số tiền muốn nạp (định dạng string thập phân chuẩn tài chính)',
  })
  amount: string;
}
