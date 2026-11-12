import { Body, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CurrencyEnum } from 'src/constant/trading.enum';
import { ApiHandleResponse, ApiPaginatedResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { AuditAccountResponse } from 'src/dto/account-dto/audit-account.dto';
import { DepositFaucetDto } from 'src/dto/account-dto/deposit-faucet.dto';
import { GetBalancesResponse } from 'src/dto/account-dto/get-balances.dto';
import { GetLedgerDto, LedgerEntryResponse } from 'src/dto/account-dto/get-ledger.dto';
import { RequestAuth } from 'src/dto/common-request.dto';
import { AccountService } from './account.service';

@IsAuthController('accounts', 'Accounts & Financial Ledger', true)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('/balances')
  @ApiOperation({
    summary: 'Lấy danh sách số dư tất cả các loại tiền (USDT, BTC, ETH, SOL)',
    description: 'Bao gồm available_balance, locked_balance và total_balance tính bằng BigNumber',
  })
  @ApiHandleResponse({
    summary: 'Get user account balances',
    type: GetBalancesResponse,
  })
  async getBalances(@Req() req: RequestAuth) {
    return await this.accountService.getBalances(req.user.userId);
  }

  @Post('/faucet')
  @ApiOperation({
    summary: 'Nạp tiền sandbox (Faucet)',
    description: 'Nạp tiền thử nghiệm vào ví, ghi nhận vào sổ cái kép và áp dụng Row-Level Locking',
  })
  @ApiHandleResponse({
    summary: 'Deposit sandbox funds',
    type: Object,
  })
  async faucet(@Req() req: RequestAuth, @Body() body: DepositFaucetDto) {
    return await this.accountService.faucet(req.user.userId, body);
  }

  @Get('/ledger')
  @ApiOperation({
    summary: 'Lấy lịch sử sổ cái tài khoản (Ledger Audit Entries)',
    description: 'Truy vấn nhật ký biến động số dư theo chuẩn kế toán kép (Double-Entry Bookkeeping)',
  })
  @ApiPaginatedResponse(LedgerEntryResponse, 'Get paginated ledger audit entries')
  async getLedgerHistory(
    @Req() req: RequestAuth,
    @Query() query: GetLedgerDto,
  ) {
    return await this.accountService.getLedgerHistory(req.user.userId, query);
  }

  @Get('/audit/:currency')
  @ApiOperation({
    summary: 'Kiểm toán tính toàn vẹn số cái (Self-Audit)',
    description: 'Tự động tính lại tổng CREDIT - DEBIT từ bảng ledger_entries và so sánh với account balance',
  })
  @ApiHandleResponse({
    summary: 'Audit ledger balance consistency',
    type: AuditAccountResponse,
  })
  async auditAccount(
    @Req() req: RequestAuth,
    @Param('currency') currency: CurrencyEnum,
  ) {
    return await this.accountService.auditAccount(req.user.userId, currency);
  }
}

