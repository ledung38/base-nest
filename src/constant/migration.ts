import { TableColumnOptions, TableForeignKey, TableForeignKeyOptions } from 'typeorm';

type ColumnOption = Omit<TableColumnOptions, 'name' | 'type' | 'enum'>;
type ForeignKeyOption = Omit<TableForeignKeyOptions, 'columnNames' | 'referencedColumnNames' | 'referencedTableName'>;

export const MigrationConst = Object.freeze({
  idPrimaryColumn: {
    name: 'id',
    type: 'integer',
    isPrimary: true,
    isGenerated: true, // Auto-increment
    generationStrategy: 'increment',
  } as TableColumnOptions,

  createdAtColumn: {
    name: 'created_at',
    type: 'timestamptz',
    default: 'now()',
  } as TableColumnOptions,

  updatedAtColumn: {
    name: 'updated_at',
    type: 'timestamptz',
    default: 'now()',
  } as TableColumnOptions,

  deletedAtColumn: {
    name: 'deleted_at',
    type: 'timestamptz',
    isNullable: true,
  } as TableColumnOptions,

  foreignKey: (columnName, tableName, option?: ForeignKeyOption, referencedColumnName = '') =>
    new TableForeignKey({
      columnNames: [columnName],
      referencedColumnNames: [referencedColumnName || 'id'],
      referencedTableName: tableName,
      ...option,
    }),

  booleanColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'boolean',
      ...option,
    }) as TableColumnOptions,

  varcharColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'varchar',
      ...option,
    }) as TableColumnOptions,

  floatColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'float',
      ...option,
    }) as TableColumnOptions,

  intColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'int',
      ...option,
    }) as TableColumnOptions,

  smallIntColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'smallInt',
      ...option,
    }) as TableColumnOptions,

  enumColumn: (name, enumType, option?: ColumnOption) =>
    ({
      name,
      type: 'enum',
      enum: Object.values(enumType),
      ...option,
    }) as TableColumnOptions,

  dateColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'date',
      ...option,
    }) as TableColumnOptions,

  timestamptzColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'timestamptz',
      ...option,
    }) as TableColumnOptions,

  jsonbColumn: (name, option?: ColumnOption) =>
    ({
      name,
      type: 'jsonb',
      ...option,
    }) as TableColumnOptions,

  numericColumn: (name, precision = 28, scale = 8, option?: ColumnOption) =>
    ({
      name,
      type: 'numeric',
      precision,
      scale,
      ...option,
    }) as TableColumnOptions,
});
