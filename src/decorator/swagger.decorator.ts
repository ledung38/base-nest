import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsDate,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinDate,
  MinLength,
  ValidateNested,
} from 'class-validator';

const ApiPropType = (type, isRequire, options: ApiPropertyOptions) =>
  applyDecorators(
    ApiProperty({
      type,
      required: isRequire,
      description: isRequire ? 'required' : 'not required',
      ...options,
    }),
    isRequire ? IsDefined() : IsOptional(),
  );

export function IsSwaggerString(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(
    ApiPropType('string', isRequire, options),
    IsString(),
    ...(isRequire ? [IsNotEmpty()] : []),
    MaxLength(options?.maxLength),
    MinLength(options?.minLength),
  );
}

export function IsSwaggerNumber(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(
    ApiPropType('number', isRequire, options),
    Type(() => Number),
    IsNumber(),
  );
}

export function IsSwaggerBoolean(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(ApiPropType('boolean', isRequire, options), IsBoolean());
}

export function IsSwaggerEnum(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(
    ApiPropType('enum', isRequire, options),
    ...(!isRequire ? [Transform((params) => (params.value === '' ? null : params.value))] : []),
    IsEnum(options.enum),
  );
}

export function IsSwaggerDto(type) {
  return applyDecorators(
    ApiProperty({ type }),
    ValidateNested({ each: true }),
    IsDefined(),
    Type(() => type),
  );
}

export function IsSwaggerDateTime(options: ApiPropertyOptions = { default: new Date() }, isRequire = true) {
  return applyDecorators(
    ApiPropType('date', isRequire, {
      description: `Example: ${new Date().toISOString()}`,
      ...options,
    }),
    IsDate(),
    Type(() => Date),
    MinDate(new Date(null)),
  );
}

export function IsSwaggerDate(options: ApiPropertyOptions = { default: '2015-03-25' }, isRequire = true) {
  return applyDecorators(
    ApiPropType('date', isRequire, {
      description: `Example: "2015-03-25" (The International Standard)`,
      ...options,
    }),
    IsDate(),
    Type(() => Date),
  );
}

export function IsSwaggerArray(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(
    ApiProperty({
      isArray: true,
      required: isRequire,
      description: isRequire ? 'required' : 'not required',
      ...options,
    }),
    ...(isRequire ? [ArrayNotEmpty()] : []),
  );
}

export function IsSwaggerFinancialDecimal(options: ApiPropertyOptions = {}, isRequire = true) {
  return applyDecorators(
    ApiPropType('string', isRequire, {
      example: '10000.00000000',
      description: 'Số tiền định dạng chuỗi thập phân chuẩn tài chính (tối đa 8 số thập phân)',
      ...options,
    }),
    IsString(),
    ...(isRequire ? [IsNotEmpty()] : []),
    IsNumberString(),
    Matches(/^\d+(\.\d{1,8})?$/, {
      message: 'Giá trị phải là số dương hợp lệ với tối đa 8 chữ số thập phân',
    }),
  );
}
