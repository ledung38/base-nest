import { Controller, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard } from 'src/auth/access-token.guard';
import { PermissionGuard } from 'src/auth/permission.guard';

export function IsAuthController(name: string, apiTag: string, isRequire = true) {
  return applyDecorators(
    Controller(name),
    ApiTags(apiTag),
    ...(isRequire ? [ApiBearerAuth(), UseGuards(AccessTokenGuard, PermissionGuard)] : []),
  );
}
