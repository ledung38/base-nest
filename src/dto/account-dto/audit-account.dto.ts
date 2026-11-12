import { ApiProperty } from '@nestjs/swagger';
import { CurrencyEnum } from 'src/constant/trading.enum';

export class AuditAccountResponse {
  @ApiProperty()
  accountId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty({ enum: CurrencyEnum })
  currency: CurrencyEnum;

  @ApiProperty({ description: 'Đạt chuẩn toàn vẹn sổ cái (không lệch dù chỉ 1 xu)' })
  isConsistent: boolean;

  @ApiProperty({ example: '10000.00000000' })
  storedAvailableBalance: string;

  @ApiProperty({ example: '10000.00000000' })
  calculatedAvailableFromLedger: string;

  @ApiProperty({ example: '0.00000000' })
  diffAvailable: string;

  @ApiProperty({ example: '0.00000000' })
  storedLockedBalance: string;

  @ApiProperty({ example: '0.00000000' })
  calculatedLockedFromLedger: string;

  @ApiProperty({ example: '0.00000000' })
  diffLocked: string;

  @ApiProperty()
  totalLedgerEntriesCount: number;

  @ApiProperty()
  auditedAt: Date;
}

