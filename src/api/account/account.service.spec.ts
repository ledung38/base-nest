import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import BigNumber from 'bignumber.js';
import {
  BalanceTypeEnum,
  CurrencyEnum,
  LedgerDirectionEnum,
  LedgerReferenceTypeEnum,
} from 'src/constant/trading.enum';
import { Account } from 'src/entities/account.entity';
import { LedgerEntry } from 'src/entities/ledger-entry.entity';
import { DataSource, EntityManager } from 'typeorm';
import { AccountService } from './account.service';

describe('AccountService (Financial Ledger Engine)', () => {
  let service: AccountService;
  let mockDataSource: Partial<DataSource>;
  let mockEntityManager: Partial<EntityManager>;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entityClass, data) => data),
      save: jest.fn().mockImplementation((entityClass, data) => Promise.resolve(data)),
      createQueryBuilder: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        return await callback(mockEntityManager as EntityManager);
      }),
      getRepository: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  describe('faucet (Deposit)', () => {
    it('should successfully deposit funds and create a CREDIT ledger entry', async () => {
      const mockAccount: Partial<Account> = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '1000.00000000',
        lockedBalance: '0.00000000',
      };

      const queryBuilder: any = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockAccount),
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);
      (mockEntityManager.findOne as jest.Mock).mockResolvedValue(mockAccount);

      const result = await service.faucet(10, {
        currency: CurrencyEnum.USDT,
        amount: '500.50000000',
      });

      expect(result.account.availableBalance).toBe('1500.50000000');
      expect(result.ledgerEntry.amount).toBe('500.50000000');
      expect(result.ledgerEntry.direction).toBe(LedgerDirectionEnum.CREDIT);
      expect(result.ledgerEntry.balanceType).toBe(BalanceTypeEnum.AVAILABLE);
      expect(result.ledgerEntry.referenceType).toBe(LedgerReferenceTypeEnum.FAUCET);
    });

    it('should throw BadRequestException if deposit amount is <= 0', async () => {
      await expect(
        service.faucet(10, {
          currency: CurrencyEnum.USDT,
          amount: '0.00000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('lockBalance', () => {
    it('should successfully move amount from available to locked and create 2 ledger entries', async () => {
      const mockAccount: Partial<Account> = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '1000.00000000',
        lockedBalance: '200.00000000',
      };

      const queryBuilder: any = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockAccount),
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.lockBalance(
        10,
        CurrencyEnum.USDT,
        '300.00000000',
        'ORDER-1234',
        'TX-5678',
        mockEntityManager as EntityManager,
      );

      // Available: 1000 - 300 = 700
      expect(result.account.availableBalance).toBe('700.00000000');
      // Locked: 200 + 300 = 500
      expect(result.account.lockedBalance).toBe('500.00000000');

      // 2 ledger entries: 1 DEBIT AVAILABLE, 1 CREDIT LOCKED
      expect(result.ledgerEntries).toHaveLength(2);
      expect(result.ledgerEntries[0].direction).toBe(LedgerDirectionEnum.DEBIT);
      expect(result.ledgerEntries[0].balanceType).toBe(BalanceTypeEnum.AVAILABLE);
      expect(result.ledgerEntries[1].direction).toBe(LedgerDirectionEnum.CREDIT);
      expect(result.ledgerEntries[1].balanceType).toBe(BalanceTypeEnum.LOCKED);
    });

    it('should throw BadRequestException if available balance is insufficient', async () => {
      const mockAccount: Partial<Account> = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '100.00000000',
        lockedBalance: '0.00000000',
      };

      const queryBuilder: any = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockAccount),
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await expect(
        service.lockBalance(
          10,
          CurrencyEnum.USDT,
          '500.00000000',
          'ORDER-FAIL',
          'TX-FAIL',
          mockEntityManager as EntityManager,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unlockBalance', () => {
    it('should successfully return locked amount to available balance', async () => {
      const mockAccount: Partial<Account> = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '700.00000000',
        lockedBalance: '300.00000000',
      };

      const queryBuilder: any = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockAccount),
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      const result = await service.unlockBalance(
        10,
        CurrencyEnum.USDT,
        '300.00000000',
        'ORDER-CANCELLED',
        'TX-UNLOCK',
        mockEntityManager as EntityManager,
      );

      expect(result.account.lockedBalance).toBe('0.00000000');
      expect(result.account.availableBalance).toBe('1000.00000000');
      expect(result.ledgerEntries).toHaveLength(2);
      expect(result.ledgerEntries[0].direction).toBe(LedgerDirectionEnum.DEBIT);
      expect(result.ledgerEntries[0].balanceType).toBe(BalanceTypeEnum.LOCKED);
      expect(result.ledgerEntries[1].direction).toBe(LedgerDirectionEnum.CREDIT);
      expect(result.ledgerEntries[1].balanceType).toBe(BalanceTypeEnum.AVAILABLE);
    });

    it('should throw BadRequestException if locked balance is insufficient to unlock', async () => {
      const mockAccount: Partial<Account> = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '1000.00000000',
        lockedBalance: '50.00000000',
      };

      const queryBuilder: any = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockAccount),
      };

      (mockEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(queryBuilder);

      await expect(
        service.unlockBalance(
          10,
          CurrencyEnum.USDT,
          '100.00000000',
          'ORDER-FAIL',
          'TX-FAIL',
          mockEntityManager as EntityManager,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('auditAccount (Self-Audit Algorithm)', () => {
    it('should return isConsistent: true when ledger sum matches stored balance', async () => {
      const mockAccount = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '10000.00000000',
        lockedBalance: '0.00000000',
      };

      const mockLedgerStats = [
        {
          balanceType: BalanceTypeEnum.AVAILABLE,
          direction: LedgerDirectionEnum.CREDIT,
          totalAmount: '10000.00000000',
          entryCount: '1',
        },
      ];

      const accountRepo = {
        findOne: jest.fn().mockResolvedValue(mockAccount),
      };

      const ledgerRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          addGroupBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue(mockLedgerStats),
        }),
      };

      (mockDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Account) return accountRepo;
        if (entity === LedgerEntry) return ledgerRepo;
        return null;
      });

      const audit = await service.auditAccount(10, CurrencyEnum.USDT);

      expect(audit.isConsistent).toBe(true);
      expect(audit.diffAvailable).toBe('0.00000000');
      expect(audit.diffLocked).toBe('0.00000000');
      expect(audit.storedAvailableBalance).toBe('10000.00000000');
      expect(audit.calculatedAvailableFromLedger).toBe('10000.00000000');
    });

    it('should return isConsistent: false when ledger sum does not match stored balance', async () => {
      const mockAccount = {
        id: 1,
        userId: 10,
        currency: CurrencyEnum.USDT,
        availableBalance: '10000.00000000', // Stored 10,000
        lockedBalance: '0.00000000',
      };

      const mockLedgerStats = [
        {
          balanceType: BalanceTypeEnum.AVAILABLE,
          direction: LedgerDirectionEnum.CREDIT,
          totalAmount: '8000.00000000', // But ledger entries only sum to 8,000!
          entryCount: '1',
        },
      ];

      const accountRepo = {
        findOne: jest.fn().mockResolvedValue(mockAccount),
      };

      const ledgerRepo = {
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          addGroupBy: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue(mockLedgerStats),
        }),
      };

      (mockDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === Account) return accountRepo;
        if (entity === LedgerEntry) return ledgerRepo;
        return null;
      });

      const audit = await service.auditAccount(10, CurrencyEnum.USDT);

      expect(audit.isConsistent).toBe(false);
      expect(audit.diffAvailable).toBe('2000.00000000');
    });
  });
});

