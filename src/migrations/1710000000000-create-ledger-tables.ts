import { EntityNameConst } from 'src/constant/entity-name';
import { MigrationConst } from 'src/constant/migration';
import {
  BalanceTypeEnum,
  CurrencyEnum,
  LedgerDirectionEnum,
  LedgerReferenceTypeEnum,
} from 'src/constant/trading.enum';
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateLedgerTables1710000000000 implements MigrationInterface {
  private accountTable = new Table({
    name: EntityNameConst.ACCOUNT,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.intColumn('user_id'),
      MigrationConst.enumColumn('currency', CurrencyEnum, {
        default: `'${CurrencyEnum.USDT}'`,
      }),
      MigrationConst.numericColumn('available_balance', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.numericColumn('locked_balance', 28, 8, {
        default: "'0.00000000'",
      }),
    ],
  });

  private ledgerEntryTable = new Table({
    name: EntityNameConst.LEDGER_ENTRY,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.intColumn('account_id'),
      MigrationConst.varcharColumn('transaction_id', { length: '64' }),
      MigrationConst.varcharColumn('reference_id', { length: '64' }),
      MigrationConst.enumColumn('reference_type', LedgerReferenceTypeEnum),
      MigrationConst.enumColumn('balance_type', BalanceTypeEnum),
      MigrationConst.enumColumn('direction', LedgerDirectionEnum),
      MigrationConst.numericColumn('amount', 28, 8),
      MigrationConst.numericColumn('balance_after', 28, 8),
      MigrationConst.varcharColumn('note', { length: '255', isNullable: true }),
    ],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create account table
    await queryRunner.createTable(this.accountTable, true);

    // Unique index (user_id, currency)
    await queryRunner.createIndex(
      EntityNameConst.ACCOUNT,
      new TableIndex({
        name: 'IDX_account_user_currency',
        columnNames: ['user_id', 'currency'],
        isUnique: true,
      }),
    );

    // Foreign key user_id -> admin(id)
    await queryRunner.createForeignKey(
      EntityNameConst.ACCOUNT,
      new TableForeignKey({
        name: 'FK_account_user',
        columnNames: ['user_id'],
        referencedTableName: EntityNameConst.ADMIN,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 2. Create ledger_entry table
    await queryRunner.createTable(this.ledgerEntryTable, true);

    // Foreign key account_id -> account(id)
    await queryRunner.createForeignKey(
      EntityNameConst.LEDGER_ENTRY,
      new TableForeignKey({
        name: 'FK_ledger_entry_account',
        columnNames: ['account_id'],
        referencedTableName: EntityNameConst.ACCOUNT,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Indexes for fast auditing and lookups
    await queryRunner.createIndex(
      EntityNameConst.LEDGER_ENTRY,
      new TableIndex({
        name: 'IDX_ledger_entry_account_created',
        columnNames: ['account_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.LEDGER_ENTRY,
      new TableIndex({
        name: 'IDX_ledger_entry_transaction_id',
        columnNames: ['transaction_id'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.LEDGER_ENTRY,
      new TableIndex({
        name: 'IDX_ledger_entry_reference_id',
        columnNames: ['reference_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(EntityNameConst.LEDGER_ENTRY, true);
    await queryRunner.dropTable(EntityNameConst.ACCOUNT, true);
  }
}

