import { Body, Post } from '@nestjs/common';
import { EntityNameConst } from 'src/constant/entity-name';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { CreateRoleDto } from 'src/dto/role-dto/create-role-dto';
import { RoleAction, RoleSummary } from './role-permission.interface';
import { RoleService } from './role.service';

@IsAuthController(EntityNameConst.ROLE, 'Role', true)
export class RolePermissionController implements Record<RoleAction, any> {
  constructor(private readonly roleService: RoleService) {}

  @Post('/')
  @ApiHandleResponse({
    summary: RoleSummary.Create,
    type: Boolean,
  })
  async [RoleAction.Create](@Body() body: CreateRoleDto) {
    return await this.roleService.create(body);
  }
  [RoleAction.Update]: any;
  [RoleAction.Active]: any;
  [RoleAction.UnActive]: any;
  [RoleAction.Delete]: any;
}
