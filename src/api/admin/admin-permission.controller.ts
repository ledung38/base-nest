import { Body, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { EntityNameConst } from 'src/constant/entity-name';
import { ApiHandleResponse, ApiPaginatedResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { CreateNewAdminDto } from 'src/dto/admin-dto/create-new-admin-dto';
import { GetAdminProfileResponse } from 'src/dto/admin-dto/get-admin-profile-dto';
import { GetAllAdminDto, GetAllAdminResponse } from 'src/dto/admin-dto/get-all-admin-dto';
import { RequestAuth } from 'src/dto/common-request.dto';
import { AdminAction, AdminSummary } from './admin-permission.interface';
import { AdminService } from './admin.service';

@IsAuthController(EntityNameConst.ADMIN, 'Admin', true)
export class AdminPermissionController implements Record<AdminAction, any> {
  constructor(private readonly adminService: AdminService) {}

  @Get('/profile')
  @ApiHandleResponse({
    summary: AdminSummary.GetProfile,
    type: GetAdminProfileResponse,
  })
  async [AdminAction.GetProfile](@Req() req: RequestAuth) {
    return await this.adminService.findById(req.user.userId, req.user.actions);
  }

  @Get('/all')
  @ApiPaginatedResponse(GetAllAdminResponse, AdminSummary.GetAll)
  async [AdminAction.GetAll](@Query() query: GetAllAdminDto) {
    return await this.adminService.getAll(query);
  }

  @Get('/:id')
  @ApiHandleResponse({
    summary: AdminSummary.GetProfile,
    type: GetAdminProfileResponse,
  })
  async [AdminAction.GetDetail](@Param('id') id: string) {
    return await this.adminService.getDetail(Number(id));
  }

  @Post('/')
  @ApiHandleResponse({
    summary: AdminSummary.Create,
    type: Boolean,
  })
  async [AdminAction.Create](@Req() req: RequestAuth, @Body() body: CreateNewAdminDto) {
    return await this.adminService.create(req.user.userId, body);
  }

  @Delete('/:id')
  @ApiHandleResponse({
    summary: AdminSummary.Delete,
    type: Boolean,
  })
  async [AdminAction.Delete](@Param('id') id: number) {
    return await this.adminService.delete(id);
  }
}
