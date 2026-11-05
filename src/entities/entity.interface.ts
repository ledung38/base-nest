import { BaseEntity, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { IsSwaggerDateTime, IsSwaggerNumber } from '../decorator/swagger.decorator';

export abstract class AbstractIdEntity extends BaseEntity {
  @IsSwaggerNumber({ default: 1 })
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;
}

export abstract class AbstractCreatedEntity extends BaseEntity {
  @IsSwaggerDateTime()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}

export abstract class AbstractTimeEntity extends AbstractIdEntity {
  @IsSwaggerDateTime()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @IsSwaggerDateTime()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

export abstract class AbstractTimeNotIdEntity extends BaseEntity {
  @IsSwaggerDateTime()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @IsSwaggerDateTime()
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
