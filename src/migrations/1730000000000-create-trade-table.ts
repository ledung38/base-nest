import { EntityNameConst } from 'src/constant/entity-name';
import { MigrationConst } from 'src/constant/migration';
import { OrderSideEnum } from 'src/constant/trading.enum';
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateTradeTable1730000000000 implements MigrationInterface {
  private tradeTable = new Table({
    name: EntityNameConst.TRADE,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.varcharColumn('symbol', { length: '20' }),
      MigrationConst.intColumn('buy_order_id', { isNullable: true }),
      MigrationConst.intColumn('sell_order_id', { isNullable: true }),
      MigrationConst.intColumn('buyer_id', { isNullable: true }),
      MigrationConst.intColumn('seller_id', { isNullable: true }),
      MigrationConst.numericColumn('price', 28, 8),
      MigrationConst.numericColumn('quantity', 28, 8),
      MigrationConst.numericColumn('quote_amount', 28, 8),
      MigrationConst.enumColumn('taker_side', OrderSideEnum),
      MigrationConst.numericColumn('buyer_fee', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.numericColumn('seller_fee', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.booleanColumn('is_simulated_liquidity', {
        default: false,
      }),
    ],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(this.tradeTable, true);

    await queryRunner.createForeignKey(
      EntityNameConst.TRADE,
      new TableForeignKey({
        name: 'FK_trade_buy_order',
        columnNames: ['buy_order_id'],
        referencedTableName: EntityNameConst.ORDER,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      EntityNameConst.TRADE,
      new TableForeignKey({
        name: 'FK_trade_sell_order',
        columnNames: ['sell_order_id'],
        referencedTableName: EntityNameConst.ORDER,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      EntityNameConst.TRADE,
      new TableForeignKey({
        name: 'FK_trade_buyer',
        columnNames: ['buyer_id'],
        referencedTableName: EntityNameConst.ADMIN,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      EntityNameConst.TRADE,
      new TableForeignKey({
        name: 'FK_trade_seller',
        columnNames: ['seller_id'],
        referencedTableName: EntityNameConst.ADMIN,
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.TRADE,
      new TableIndex({
        name: 'IDX_trade_symbol_created',
        columnNames: ['symbol', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.TRADE,
      new TableIndex({
        name: 'IDX_trade_buyer_created',
        columnNames: ['buyer_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.TRADE,
      new TableIndex({
        name: 'IDX_trade_seller_created',
        columnNames: ['seller_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.TRADE,
      new TableIndex({
        name: 'IDX_trade_buy_order',
        columnNames: ['buy_order_id'],
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.TRADE,
      new TableIndex({
        name: 'IDX_trade_sell_order',
        columnNames: ['sell_order_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(EntityNameConst.TRADE, true);
  }
}
