import { EntityNameConst } from 'src/constant/entity-name';
import { Gender } from 'src/constant/enum-common';
import { MigrationConst } from 'src/constant/migration';
import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class InitBaseTables1700000000000 implements MigrationInterface {
  private roleTable = new Table({
    name: EntityNameConst.ROLE,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.varcharColumn('code', { isUnique: true }),
      MigrationConst.varcharColumn('name'),
      MigrationConst.booleanColumn('is_active', { default: true }),
    ],
  });

  private permissionTable = new Table({
    name: EntityNameConst.PERMISSION,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.varcharColumn('code', { isUnique: true }),
      MigrationConst.varcharColumn('name'),
      MigrationConst.booleanColumn('is_active', { default: true }),
    ],
  });

  private rolePermissionTable = new Table({
    name: EntityNameConst.ROLE_PERMISSION,
    columns: [
      MigrationConst.intColumn('role_id', { isPrimary: true }),
      MigrationConst.intColumn('permission_id', { isPrimary: true }),
      MigrationConst.booleanColumn('is_active', { default: true }),
    ],
  });

  private adminTable = new Table({
    name: EntityNameConst.ADMIN,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.createdAtColumn,
      MigrationConst.updatedAtColumn,
      MigrationConst.varcharColumn('username', { isUnique: true }),
      MigrationConst.varcharColumn('email', { isUnique: true }),
      MigrationConst.varcharColumn('password'),
      MigrationConst.varcharColumn('full_name'),
      MigrationConst.dateColumn('date_of_birth', { isNullable: true }),
      MigrationConst.varcharColumn('phone_number', { isNullable: true }),
      MigrationConst.varcharColumn('address', { isNullable: true }),
      MigrationConst.enumColumn('gender', Gender, { isNullable: true }),
      MigrationConst.booleanColumn('is_super_admin', { default: false }),
      MigrationConst.intColumn('role_id', { isNullable: true }),
      MigrationConst.intColumn('parent_id', { isNullable: true }),
    ],
  });

  private adminClosureTable = new Table({
    name: EntityNameConst.ADMIN_CLOSURE,
    columns: [MigrationConst.intColumn('ancestor_id'), MigrationConst.intColumn('descendant_id')],
  });

  private uploadTable = new Table({
    name: EntityNameConst.UPLOAD,
    columns: [
      MigrationConst.createdAtColumn,
      MigrationConst.varcharColumn('path', { isPrimary: true }),
      MigrationConst.booleanColumn('is_active', { default: false }),
      MigrationConst.intColumn('creator_id', { isNullable: true }),
    ],
  });

  private uploadCleanHistoryTable = new Table({
    name: EntityNameConst.UPLOAD_CLEAN_HISTORY,
    columns: [
      MigrationConst.idPrimaryColumn,
      MigrationConst.timestamptzColumn('start_at'),
      MigrationConst.timestamptzColumn('end_at'),
      MigrationConst.intColumn('total_success'),
      MigrationConst.intColumn('total_error'),
    ],
  });

  private rolePermissionForeignKey: TableForeignKey[] = [
    MigrationConst.foreignKey('role_id', EntityNameConst.ROLE, { onDelete: 'CASCADE' }),
    MigrationConst.foreignKey('permission_id', EntityNameConst.PERMISSION, { onDelete: 'CASCADE' }),
  ];

  private adminForeignKey: TableForeignKey[] = [
    MigrationConst.foreignKey('role_id', EntityNameConst.ROLE, { onDelete: 'SET NULL' }),
    MigrationConst.foreignKey('parent_id', EntityNameConst.ADMIN, { onDelete: 'SET NULL' }),
  ];

  private adminClosureForeignKey: TableForeignKey[] = [
    MigrationConst.foreignKey('ancestor_id', EntityNameConst.ADMIN, { onDelete: 'CASCADE' }),
    MigrationConst.foreignKey('descendant_id', EntityNameConst.ADMIN, { onDelete: 'CASCADE' }),
  ];

  private uploadForeignKey: TableForeignKey[] = [
    MigrationConst.foreignKey('creator_id', EntityNameConst.ADMIN, { onDelete: 'SET NULL' }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(this.roleTable, true);
    await queryRunner.createTable(this.permissionTable, true);
    await queryRunner.createTable(this.rolePermissionTable, true);
    await queryRunner.createForeignKeys(this.rolePermissionTable, this.rolePermissionForeignKey);

    await queryRunner.createTable(this.adminTable, true);
    await queryRunner.createTable(this.adminClosureTable, true);
    await queryRunner.createForeignKeys(this.adminTable, this.adminForeignKey);
    await queryRunner.createForeignKeys(this.adminClosureTable, this.adminClosureForeignKey);

    await queryRunner.createTable(this.uploadTable, true);
    await queryRunner.createTable(this.uploadCleanHistoryTable, true);
    await queryRunner.createForeignKeys(this.uploadTable, this.uploadForeignKey);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKeys(this.uploadTable, this.uploadForeignKey);
    await queryRunner.dropTable(this.uploadTable, true);
    await queryRunner.dropTable(this.uploadCleanHistoryTable, true);

    await queryRunner.dropForeignKeys(this.adminClosureTable, this.adminClosureForeignKey);
    await queryRunner.dropForeignKeys(this.adminTable, this.adminForeignKey);
    await queryRunner.dropTable(this.adminClosureTable, true);
    await queryRunner.dropTable(this.adminTable, true);

    await queryRunner.dropForeignKeys(this.rolePermissionTable, this.rolePermissionForeignKey);
    await queryRunner.dropTable(this.rolePermissionTable, true);
    await queryRunner.dropTable(this.permissionTable, true);
    await queryRunner.dropTable(this.roleTable, true);
  }
}

