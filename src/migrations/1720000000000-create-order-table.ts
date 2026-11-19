import { EntityNameConst } from 'src/constant/entity-name';
import { MigrationConst } from 'src/constant/migration';
import {
  CurrencyEnum,
  OrderSideEnum,
  OrderStatusEnum,
  OrderTypeEnum,
} from 'src/constant/trading.enum';
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateOrderTable1720000000000 implements MigrationInterface {
  private orderTable = new Table({
    name: EntityNameConst.ORDER,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.intColumn('user_id'),
      MigrationConst.varcharColumn('idempotency_key', { length: '64' }),
      MigrationConst.varcharColumn('symbol', { length: '20' }),
      MigrationConst.enumColumn('side', OrderSideEnum),
      MigrationConst.enumColumn('type', OrderTypeEnum),
      MigrationConst.numericColumn('price', 28, 8),
      MigrationConst.numericColumn('quantity', 28, 8),
      MigrationConst.numericColumn('filled_quantity', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.enumColumn('locked_currency', CurrencyEnum),
      MigrationConst.numericColumn('locked_amount', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.enumColumn('status', OrderStatusEnum, {
        default: `'${OrderStatusEnum.QUEUED}'`,
      }),
      MigrationConst.varcharColumn('reject_reason', {
        length: '255',
        isNullable: true,
      }),
    ],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(this.orderTable, true);

    await queryRunner.createForeignKey(
      EntityNameConst.ORDER,
      new TableForeignKey({
        name: 'FK_order_user',
        columnNames: ['user_id'],
        referencedTableName: EntityNameConst.ADMIN,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.ORDER,
      new TableIndex({
        name: 'IDX_order_idempotency_key',
        columnNames: ['idempotency_key'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.ORDER,
      new TableIndex({
        name: 'IDX_order_user_status_created',
        columnNames: ['user_id', 'status', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.ORDER,
      new TableIndex({
        name: 'IDX_order_symbol_status',
        columnNames: ['symbol', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(EntityNameConst.ORDER, true);
  }
}
