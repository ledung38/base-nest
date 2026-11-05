import { Injectable } from '@nestjs/common';
import { CreateRoleDto } from 'src/dto/role-dto/create-role-dto';
import { Role } from 'src/entities/role.entity';
import { AppExistedException } from 'src/middleware/app-error-handler';
import { roleHelper } from '../../helper/role-helper.service';

@Injectable()
export class RoleService {
  create = async (body: CreateRoleDto) => {
    const existRole = await roleHelper.isExistRoleByCode(body.code);
    if (existRole) throw new AppExistedException('code', body);
    let role = new Role();
    role.code = body.code;
    role.name = body.name;
    role = await role.save();
    return !!role;
  };
}
