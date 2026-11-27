import { EntityNameConst } from 'src/constant/entity-name';
import { MigrationConst } from 'src/constant/migration';
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateMarketCandleAndAlphaBot1750000000000
  implements MigrationInterface
{
  private marketCandleTable = new Table({
    name: EntityNameConst.MARKET_CANDLE,
    columns: [
      {
        name: 'symbol',
        type: 'varchar',
        length: '20',
        isPrimary: true,
      },
      {
        name: 'interval',
        type: 'varchar',
        length: '10',
        isPrimary: true,
      },
      {
        name: 'open_time',
        type: 'bigint',
        isPrimary: true,
      },
      {
        name: 'close_time',
        type: 'bigint',
      },
      MigrationConst.numericColumn('open', 28, 8),
      MigrationConst.numericColumn('high', 28, 8),
      MigrationConst.numericColumn('low', 28, 8),
      MigrationConst.numericColumn('close', 28, 8),
      MigrationConst.numericColumn('volume', 28, 8),
      MigrationConst.intColumn('trades_count', { default: 0 }),
      MigrationConst.updatedAtColumn,
    ],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(this.marketCandleTable, true);

    // Chuyển đổi enum bot_type: EMA_CROSS -> ALPHA_SIGNAL (an toàn & idempotent)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'bot_config_bot_type_enum'
            AND e.enumlabel = 'EMA_CROSS'
        ) THEN
          ALTER TYPE bot_config_bot_type_enum RENAME VALUE 'EMA_CROSS' TO 'ALPHA_SIGNAL';
        ELSIF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'bot_config_bot_type_enum'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'bot_config_bot_type_enum'
            AND e.enumlabel = 'ALPHA_SIGNAL'
        ) THEN
          ALTER TYPE bot_config_bot_type_enum ADD VALUE 'ALPHA_SIGNAL';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(EntityNameConst.MARKET_CANDLE, true);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'bot_config_bot_type_enum'
            AND e.enumlabel = 'ALPHA_SIGNAL'
        ) THEN
          ALTER TYPE bot_config_bot_type_enum RENAME VALUE 'ALPHA_SIGNAL' TO 'EMA_CROSS';
        END IF;
      END $$;
    `);
  }
}
