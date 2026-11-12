import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import BigNumber from 'bignumber.js';
import {
  BalanceTypeEnum,
  CurrencyEnum,
  LedgerDirectionEnum,
  LedgerReferenceTypeEnum,
} from 'src/constant/trading.enum';
import { AuditAccountResponse } from 'src/dto/account-dto/audit-account.dto';
import { DepositFaucetDto } from 'src/dto/account-dto/deposit-faucet.dto';
import {
  AccountBalanceItemResponse,
  GetBalancesResponse,
} from 'src/dto/account-dto/get-balances.dto';
import { GetLedgerDto } from 'src/dto/account-dto/get-ledger.dto';
import { PageDto, PageMetaDto } from 'src/dto/paginate.dto';
import { Account } from 'src/entities/account.entity';
import { LedgerEntry } from 'src/entities/ledger-entry.entity';
import { DataSource, EntityManager } from 'typeorm';

// Helper tạo UUID v4 đơn giản hoặc dùng crypto native
import { randomUUID } from 'crypto';

@Injectable()
export class AccountService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Lấy hoặc tự động khởi tạo tài khoản nếu chưa tồn tại
   */
  async getOrCreateAccount(
    userId: number,
    currency: CurrencyEnum,
    manager: EntityManager,
  ): Promise<Account> {
    let account = await manager.findOne(Account, {
      where: { userId, currency },
    });

    if (!account) {
      account = manager.create(Account, {
        userId,
        currency,
        availableBalance: '0.00000000',
        lockedBalance: '0.00000000',
      });
      account = await manager.save(Account, account);
    }

    return account;
  }

  /**
   * Lấy danh sách số dư tất cả các loại tiền của người dùng
   */
  async getBalances(userId: number): Promise<GetBalancesResponse> {
    const currencies = Object.values(CurrencyEnum);

    // Đảm bảo user luôn có sẵn tài khoản cho các đồng tiền chính
    await this.dataSource.transaction(async (manager) => {
      for (const cur of currencies) {
        await this.getOrCreateAccount(userId, cur, manager);
      }
    });

    const accounts = await this.dataSource.getRepository(Account).find({
      where: { userId },
      order: { currency: 'ASC' },
    });

    const balances: AccountBalanceItemResponse[] = accounts.map((acc) => {
      const total = new BigNumber(acc.availableBalance)
        .plus(acc.lockedBalance)
        .toFixed(8);

      return {
        id: acc.id,
        currency: acc.currency,
        availableBalance: acc.availableBalance,
        lockedBalance: acc.lockedBalance,
        totalBalance: total,
        updatedAt: acc.updatedAt,
      };
    });

    return { balances };
  }

  /**
   * Nạp tiền trải nghiệm sandbox (Faucet / Deposit)
   * Sử dụng Pessimistic Lock (SELECT FOR UPDATE) để chống Race Condition
   */
  async faucet(
    userId: number,
    dto: DepositFaucetDto,
  ): Promise<{ account: Account; ledgerEntry: LedgerEntry }> {
    const depositAmount = new BigNumber(dto.amount);
    if (!depositAmount.isGreaterThan(0)) {
      throw new BadRequestException('Số tiền nạp phải lớn hơn 0');
    }

    const txId = randomUUID();

    return await this.dataSource.transaction(async (manager) => {
      // 1. Đảm bảo account tồn tại
      await this.getOrCreateAccount(userId, dto.currency, manager);

      // 2. Lock bản ghi account bằng Pessimistic Write Lock (SELECT ... FOR UPDATE)
      const account = await manager
        .createQueryBuilder(Account, 'acc')
        .setLock('pessimistic_write')
        .where('acc.user_id = :userId AND acc.currency = :currency', {
          userId,
          currency: dto.currency,
        })
        .getOne();

      if (!account) {
        throw new NotFoundException('Không tìm thấy tài khoản');
      }

      // 3. Tính toán số dư mới bằng BigNumber (chống lỗi IEEE 754 float)
      const newAvailable = new BigNumber(account.availableBalance)
        .plus(depositAmount)
        .toFixed(8);

      account.availableBalance = newAvailable;
      await manager.save(Account, account);

      // 4. Ghi bản ghi sổ cái kép (Double-Entry Ledger)
      const ledgerEntry = manager.create(LedgerEntry, {
        accountId: account.id,
        transactionId: txId,
        referenceId: txId,
        referenceType: LedgerReferenceTypeEnum.FAUCET,
        balanceType: BalanceTypeEnum.AVAILABLE,
        direction: LedgerDirectionEnum.CREDIT,
        amount: depositAmount.toFixed(8),
        balanceAfter: newAvailable,
        note: `Sandbox faucet deposit ${depositAmount.toFixed(8)} ${dto.currency}`,
      });

      await manager.save(LedgerEntry, ledgerEntry);

      return { account, ledgerEntry };
    });
  }

  /**
   * Khóa số dư khi đặt lệnh (Lock Balance)
   * Chuyển tiền từ available_balance sang locked_balance
   */
  async lockBalance(
    userId: number,
    currency: CurrencyEnum,
    amount: string,
    referenceId: string,
    transactionId?: string,
    externalManager?: EntityManager,
  ): Promise<{ account: Account; ledgerEntries: LedgerEntry[] }> {
    const lockAmount = new BigNumber(amount);
    if (!lockAmount.isGreaterThan(0)) {
      throw new BadRequestException('Số tiền khóa phải lớn hơn 0');
    }

    const txId = transactionId || randomUUID();

    const executeLock = async (manager: EntityManager) => {
      // 1. Lock bản ghi account với SELECT FOR UPDATE
      const account = await manager
        .createQueryBuilder(Account, 'acc')
        .setLock('pessimistic_write')
        .where('acc.user_id = :userId AND acc.currency = :currency', {
          userId,
          currency,
        })
        .getOne();

      if (!account) {
        throw new NotFoundException(
          `Không tìm thấy tài khoản cho đồng ${currency}`,
        );
      }

      const currentAvailable = new BigNumber(account.availableBalance);
      if (currentAvailable.isLessThan(lockAmount)) {
        throw new BadRequestException(
          `Số dư khả dụng không đủ: Cần ${lockAmount.toFixed(8)} ${currency}, hiện có ${currentAvailable.toFixed(8)} ${currency}`,
        );
      }

      // 2. Chuyển tiền giữa 2 trạng thái
      const newAvailable = currentAvailable.minus(lockAmount).toFixed(8);
      const newLocked = new BigNumber(account.lockedBalance)
        .plus(lockAmount)
        .toFixed(8);

      account.availableBalance = newAvailable;
      account.lockedBalance = newLocked;
      await manager.save(Account, account);

      // 3. Ghi 2 bản ghi Ledger tương ứng (Cân đối Nợ/Có)
      const debitEntry = manager.create(LedgerEntry, {
        accountId: account.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.ORDER_LOCK,
        balanceType: BalanceTypeEnum.AVAILABLE,
        direction: LedgerDirectionEnum.DEBIT,
        amount: lockAmount.toFixed(8),
        balanceAfter: newAvailable,
        note: `Lock balance for order ${referenceId}`,
      });

      const creditEntry = manager.create(LedgerEntry, {
        accountId: account.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.ORDER_LOCK,
        balanceType: BalanceTypeEnum.LOCKED,
        direction: LedgerDirectionEnum.CREDIT,
        amount: lockAmount.toFixed(8),
        balanceAfter: newLocked,
        note: `Credit locked balance for order ${referenceId}`,
      });

      await manager.save(LedgerEntry, [debitEntry, creditEntry]);

      return { account, ledgerEntries: [debitEntry, creditEntry] };
    };

    if (externalManager) {
      return await executeLock(externalManager);
    } else {
      return await this.dataSource.transaction(executeLock);
    }
  }

  /**
   * Mở khóa số dư khi hủy lệnh (Unlock Balance)
   * Chuyển tiền từ locked_balance về available_balance
   */
  async unlockBalance(
    userId: number,
    currency: CurrencyEnum,
    amount: string,
    referenceId: string,
    transactionId?: string,
    externalManager?: EntityManager,
  ): Promise<{ account: Account; ledgerEntries: LedgerEntry[] }> {
    const unlockAmount = new BigNumber(amount);
    if (!unlockAmount.isGreaterThan(0)) {
      throw new BadRequestException('Số tiền mở khóa phải lớn hơn 0');
    }

    const txId = transactionId || randomUUID();

    const executeUnlock = async (manager: EntityManager) => {
      const account = await manager
        .createQueryBuilder(Account, 'acc')
        .setLock('pessimistic_write')
        .where('acc.user_id = :userId AND acc.currency = :currency', {
          userId,
          currency,
        })
        .getOne();

      if (!account) {
        throw new NotFoundException(
          `Không tìm thấy tài khoản cho đồng ${currency}`,
        );
      }

      const currentLocked = new BigNumber(account.lockedBalance);
      if (currentLocked.isLessThan(unlockAmount)) {
        throw new BadRequestException(
          `Số dư đang khóa không đủ để mở khóa: Cần ${unlockAmount.toFixed(8)}, hiện có ${currentLocked.toFixed(8)}`,
        );
      }

      const newLocked = currentLocked.minus(unlockAmount).toFixed(8);
      const newAvailable = new BigNumber(account.availableBalance)
        .plus(unlockAmount)
        .toFixed(8);

      account.lockedBalance = newLocked;
      account.availableBalance = newAvailable;
      await manager.save(Account, account);

      const debitLocked = manager.create(LedgerEntry, {
        accountId: account.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.ORDER_UNLOCK,
        balanceType: BalanceTypeEnum.LOCKED,
        direction: LedgerDirectionEnum.DEBIT,
        amount: unlockAmount.toFixed(8),
        balanceAfter: newLocked,
        note: `Unlock balance from cancelled order ${referenceId}`,
      });

      const creditAvailable = manager.create(LedgerEntry, {
        accountId: account.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.ORDER_UNLOCK,
        balanceType: BalanceTypeEnum.AVAILABLE,
        direction: LedgerDirectionEnum.CREDIT,
        amount: unlockAmount.toFixed(8),
        balanceAfter: newAvailable,
        note: `Credit back to available balance from cancelled order ${referenceId}`,
      });

      await manager.save(LedgerEntry, [debitLocked, creditAvailable]);

      return { account, ledgerEntries: [debitLocked, creditAvailable] };
    };

    if (externalManager) {
      return await executeUnlock(externalManager);
    } else {
      return await this.dataSource.transaction(executeUnlock);
    }
  }

  /**
   * Thanh toán cấn trừ khi khớp lệnh (Trade Settlement)
   * Trừ tiền ký quỹ (locked) và cộng tiền nhận được (available)
   */
  async settleTrade(
    userId: number,
    spendCurrency: CurrencyEnum,
    spendAmount: string,
    receiveCurrency: CurrencyEnum,
    receiveAmount: string,
    referenceId: string,
    transactionId?: string,
    externalManager?: EntityManager,
  ): Promise<void> {
    const txId = transactionId || randomUUID();
    const spendBN = new BigNumber(spendAmount);
    const receiveBN = new BigNumber(receiveAmount);

    const executeSettle = async (manager: EntityManager) => {
      // 1. Trừ tiền đang khóa (spendCurrency)
      const spendAccount = await manager
        .createQueryBuilder(Account, 'acc')
        .setLock('pessimistic_write')
        .where('acc.user_id = :userId AND acc.currency = :currency', {
          userId,
          currency: spendCurrency,
        })
        .getOne();

      if (!spendAccount) {
        throw new NotFoundException(
          `Không tìm thấy tài khoản chi trả ${spendCurrency}`,
        );
      }

      const newSpendLocked = new BigNumber(spendAccount.lockedBalance)
        .minus(spendBN)
        .toFixed(8);

      spendAccount.lockedBalance = newSpendLocked;
      await manager.save(Account, spendAccount);

      const spendLedger = manager.create(LedgerEntry, {
        accountId: spendAccount.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.TRADE_SETTLEMENT,
        balanceType: BalanceTypeEnum.LOCKED,
        direction: LedgerDirectionEnum.DEBIT,
        amount: spendBN.toFixed(8),
        balanceAfter: newSpendLocked,
        note: `Settle trade ${referenceId}: spent ${spendBN.toFixed(8)} ${spendCurrency}`,
      });

      // 2. Cộng tiền nhận được vào available (receiveCurrency)
      const receiveAccount = await this.getOrCreateAccount(
        userId,
        receiveCurrency,
        manager,
      );

      const lockedReceiveAccount = await manager
        .createQueryBuilder(Account, 'acc')
        .setLock('pessimistic_write')
        .where('acc.id = :id', { id: receiveAccount.id })
        .getOne();

      const newReceiveAvailable = new BigNumber(
        lockedReceiveAccount.availableBalance,
      )
        .plus(receiveBN)
        .toFixed(8);

      lockedReceiveAccount.availableBalance = newReceiveAvailable;
      await manager.save(Account, lockedReceiveAccount);

      const receiveLedger = manager.create(LedgerEntry, {
        accountId: lockedReceiveAccount.id,
        transactionId: txId,
        referenceId,
        referenceType: LedgerReferenceTypeEnum.TRADE_SETTLEMENT,
        balanceType: BalanceTypeEnum.AVAILABLE,
        direction: LedgerDirectionEnum.CREDIT,
        amount: receiveBN.toFixed(8),
        balanceAfter: newReceiveAvailable,
        note: `Settle trade ${referenceId}: received ${receiveBN.toFixed(8)} ${receiveCurrency}`,
      });

      await manager.save(LedgerEntry, [spendLedger, receiveLedger]);
    };

    if (externalManager) {
      await executeSettle(externalManager);
    } else {
      await this.dataSource.transaction(executeSettle);
    }
  }

  /**
   * Tính toán kiểm toán toàn vẹn sổ cái (Self-Audit Algorithm)
   * Chứng minh tính nhất quán số dư 100% không lệch xu nào
   */
  async auditAccount(
    userId: number,
    currency: CurrencyEnum,
  ): Promise<AuditAccountResponse> {
    const account = await this.dataSource.getRepository(Account).findOne({
      where: { userId, currency },
    });

    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản');
    }

    // Query tổng CREDIT và DEBIT từ bảng ledger_entries
    const ledgerStats = await this.dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('le')
      .select('le.balance_type', 'balanceType')
      .addSelect('le.direction', 'direction')
      .addSelect('SUM(le.amount)', 'totalAmount')
      .addSelect('COUNT(le.id)', 'entryCount')
      .where('le.account_id = :accountId', { accountId: account.id })
      .groupBy('le.balance_type')
      .addGroupBy('le.direction')
      .getRawMany();

    let calcAvailable = new BigNumber(0);
    let calcLocked = new BigNumber(0);
    let totalCount = 0;

    for (const stat of ledgerStats) {
      const amount = new BigNumber(stat.totalAmount || 0);
      const count = Number(stat.entryCount || 0);
      totalCount += count;

      if (stat.balanceType === BalanceTypeEnum.AVAILABLE) {
        if (stat.direction === LedgerDirectionEnum.CREDIT) {
          calcAvailable = calcAvailable.plus(amount);
        } else {
          calcAvailable = calcAvailable.minus(amount);
        }
      } else if (stat.balanceType === BalanceTypeEnum.LOCKED) {
        if (stat.direction === LedgerDirectionEnum.CREDIT) {
          calcLocked = calcLocked.plus(amount);
        } else {
          calcLocked = calcLocked.minus(amount);
        }
      }
    }

    const storedAvailable = new BigNumber(account.availableBalance);
    const storedLocked = new BigNumber(account.lockedBalance);

    const diffAvailable = storedAvailable.minus(calcAvailable);
    const diffLocked = storedLocked.minus(calcLocked);

    const isConsistent = diffAvailable.isZero() && diffLocked.isZero();

    return {
      accountId: account.id,
      userId,
      currency,
      isConsistent,
      storedAvailableBalance: storedAvailable.toFixed(8),
      calculatedAvailableFromLedger: calcAvailable.toFixed(8),
      diffAvailable: diffAvailable.toFixed(8),
      storedLockedBalance: storedLocked.toFixed(8),
      calculatedLockedFromLedger: calcLocked.toFixed(8),
      diffLocked: diffLocked.toFixed(8),
      totalLedgerEntriesCount: totalCount,
      auditedAt: new Date(),
    };
  }

  /**
   * Lấy lịch sử sổ cái (Ledger Entries) phân trang
   */
  async getLedgerHistory(
    userId: number,
    query: GetLedgerDto,
  ): Promise<PageDto<LedgerEntry>> {
    const qb = this.dataSource
      .getRepository(LedgerEntry)
      .createQueryBuilder('le')
      .innerJoin('le.account', 'acc')
      .where('acc.user_id = :userId', { userId });

    if (query.currency) {
      qb.andWhere('acc.currency = :currency', { currency: query.currency });
    }
    if (query.balanceType) {
      qb.andWhere('le.balance_type = :balanceType', {
        balanceType: query.balanceType,
      });
    }
    if (query.direction) {
      qb.andWhere('le.direction = :direction', { direction: query.direction });
    }
    if (query.referenceType) {
      qb.andWhere('le.reference_type = :referenceType', {
        referenceType: query.referenceType,
      });
    }

    qb.orderBy('le.created_at', query.sortBy || 'DESC')
      .skip(query.skip)
      .take(query.take);

    const [data, itemCount] = await qb.getManyAndCount();
    const pageMeta = new PageMetaDto({ pageOptionsDto: query, itemCount });

    return new PageDto(data, pageMeta);
  }
}

