import { EntityNameConst } from 'src/constant/entity-name';
import { MigrationConst } from 'src/constant/migration';
import { BotTypeEnum } from 'src/constant/trading.enum';
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateBotConfigTable1740000000000 implements MigrationInterface {
  private botConfigTable = new Table({
    name: EntityNameConst.BOT_CONFIG,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.intColumn('user_id'),
      MigrationConst.enumColumn('bot_type', BotTypeEnum),
      MigrationConst.varcharColumn('symbol', { length: '20' }),
      MigrationConst.varcharColumn('name', { length: '100' }),
      {
        name: 'parameters',
        type: 'jsonb',
      },
      MigrationConst.booleanColumn('is_active', {
        default: false,
      }),
      MigrationConst.numericColumn('realized_pnl', 28, 8, {
        default: "'0.00000000'",
      }),
      MigrationConst.intColumn('total_trades_count', {
        default: 0,
      }),
      MigrationConst.varcharColumn('last_signal', {
        length: '20',
        isNullable: true,
      }),
      {
        name: 'last_run_at',
        type: 'timestamptz',
        isNullable: true,
      },
    ],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(this.botConfigTable, true);

    await queryRunner.createForeignKey(
      EntityNameConst.BOT_CONFIG,
      new TableForeignKey({
        name: 'FK_bot_config_user',
        columnNames: ['user_id'],
        referencedTableName: EntityNameConst.ADMIN,
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      EntityNameConst.BOT_CONFIG,
      new TableIndex({
        name: 'IDX_bot_config_user_symbol_type',
        columnNames: ['user_id', 'symbol', 'bot_type'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(EntityNameConst.BOT_CONFIG, true);
  }
}
