import { Body, Post } from '@nestjs/common';
import { EntityNameConst } from 'src/constant/entity-name';
import { ApiHandleResponse } from 'src/decorator/api.decorator';
import { IsAuthController } from 'src/decorator/auth.decorator';
import { LoginAdminDto } from 'src/dto/admin-dto/login-admin-dto';
import { LoginResponse } from 'src/dto/common-response.dto';
import { AdminService } from './admin.service';

@IsAuthController(EntityNameConst.ADMIN, 'Admin', false)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('/login')
  @ApiHandleResponse({
    summary: 'Login admin account',
    type: LoginResponse,
  })
  async login(@Body() body: LoginAdminDto) {
    return await this.adminService.login(body);
  }
}
