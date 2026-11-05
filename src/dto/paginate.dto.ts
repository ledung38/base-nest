import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Max, Min } from 'class-validator';
import { LimitConst } from 'src/constant/limit';
import { IsSwaggerEnum, IsSwaggerNumber, IsSwaggerString } from '../decorator/swagger.decorator';

export enum Sort {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class PageOptionsDto {
  @IsSwaggerString({ default: 'createdAt' }, false)
  readonly orderBy?: string = 'createdAt';

  @IsSwaggerEnum({ enum: Sort, default: Sort.DESC }, false)
  readonly sortBy?: Sort = Sort.DESC;

  @IsSwaggerNumber(
    {
      minimum: 0,
      default: 0,
    },
    false,
  )
  @IsInt()
  @Min(0)
  readonly page?: number = 0;

  @IsSwaggerNumber(
    {
      minimum: 1,
      maximum: LimitConst.paginationTake,
      default: 10,
    },
    false,
  )
  @IsInt()
  @Min(1)
  @Max(LimitConst.paginationTake)
  readonly take?: number = 10;

  get skip(): number {
    return this.page * this.take;
  }
}

export interface PageMetaDtoParameters {
  pageOptionsDto: PageOptionsDto;
  itemCount: number;
}

export class PageMetaDto {
  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly take: number;

  @ApiProperty()
  readonly itemCount: number;

  @ApiProperty()
  readonly pageCount: number;

  @ApiProperty()
  readonly hasPreviousPage: boolean;

  @ApiProperty()
  readonly hasNextPage: boolean;

  constructor({ pageOptionsDto, itemCount }: PageMetaDtoParameters) {
    this.page = Number(pageOptionsDto.page);
    this.take = Number(pageOptionsDto.take);
    this.itemCount = itemCount;
    this.pageCount = Math.ceil(this.itemCount / this.take);
    this.hasPreviousPage = this.page > 0;
    this.hasNextPage = this.page + 1 < this.pageCount;
  }
}

export class PageDto<T> {
  @IsArray()
  @ApiProperty({ isArray: true })
  readonly data: T[];

  @ApiProperty({ type: () => PageMetaDto })
  readonly meta: PageMetaDto;

  constructor(data: T[], meta: PageMetaDto) {
    this.data = data;
    this.meta = meta;
  }
}
