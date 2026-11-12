import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  BalanceTypeEnum,
  CurrencyEnum,
  LedgerDirectionEnum,
  LedgerReferenceTypeEnum,
} from 'src/constant/trading.enum';
import { PageOptionsDto } from '../paginate.dto';

export class GetLedgerDto extends PageOptionsDto {
  @ApiPropertyOptional({ enum: CurrencyEnum })
  @IsOptional()
  @IsEnum(CurrencyEnum)
  currency?: CurrencyEnum;

  @ApiPropertyOptional({ enum: BalanceTypeEnum })
  @IsOptional()
  @IsEnum(BalanceTypeEnum)
  balanceType?: BalanceTypeEnum;

  @ApiPropertyOptional({ enum: LedgerDirectionEnum })
  @IsOptional()
  @IsEnum(LedgerDirectionEnum)
  direction?: LedgerDirectionEnum;

  @ApiPropertyOptional({ enum: LedgerReferenceTypeEnum })
  @IsOptional()
  @IsEnum(LedgerReferenceTypeEnum)
  referenceType?: LedgerReferenceTypeEnum;
}

export class LedgerEntryResponse {
  id: number;
  accountId: number;
  currency: CurrencyEnum;
  transactionId: string;
  referenceId: string;
  referenceType: LedgerReferenceTypeEnum;
  balanceType: BalanceTypeEnum;
  direction: LedgerDirectionEnum;
  amount: string;
  balanceAfter: string;
  note?: string;
  createdAt: Date;
}

