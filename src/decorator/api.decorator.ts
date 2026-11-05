import { applyDecorators, HttpCode, HttpStatus, Type } from '@nestjs/common';
import {
  ApiDefaultResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponseOptions,
  getSchemaPath,
} from '@nestjs/swagger';
import { PageDto } from '../dto/paginate.dto';
import { DefaultResponse } from '../dto/common-response.dto';

export const ApiPaginatedResponse = <TModel extends Type<any>>(model: TModel, summary = '') => {
  return applyDecorators(
    ApiOperation({ summary }),
    HttpCode(HttpStatus.OK),
    ApiExtraModels(PageDto, model),
    ApiOkResponse({
      description: 'Successfully received model list',
      schema: {
        allOf: [
          { $ref: getSchemaPath(PageDto) },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
};

export const ApiHandleResponse = ({
  summary,
  operationId,
  type,
  httpStatus = HttpStatus.OK,
  ...options
}: {
  summary: string;
  type: any;
  operationId?: string;
  httpStatus?: HttpStatus;
} & ApiResponseOptions) => {
  return applyDecorators(
    ApiOkResponse({
      description: 'The response data template after processing successful',
      type: type,
      ...options,
    }),
    ApiDefaultResponse({
      description: 'The response data template after processing encounters exception',
      type: DefaultResponse,
    }),
    HttpCode(httpStatus),
    ApiOperation({ summary, operationId }),
  );
};
