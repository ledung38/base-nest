import { CACHE_MANAGER, CacheStore } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ERROR_MSG } from 'src/constant/error';
import { RoleCode } from 'src/constant/role';
import { ChangePasswordAdminDto } from 'src/dto/admin-dto/change-password-admin-dto';
import { CreateNewAdminDto } from 'src/dto/admin-dto/create-new-admin-dto';
import { GetAllAdminDto } from 'src/dto/admin-dto/get-all-admin-dto';
import { LoginAdminDto } from 'src/dto/admin-dto/login-admin-dto';
import { UpdateAdminDto } from 'src/dto/admin-dto/update-admin-dto';
import { GetUploadListResponse } from 'src/dto/common-response.dto';
import { PageDto, PageMetaDto } from 'src/dto/paginate.dto';
import { Admin } from 'src/entities/admin.entity';
import { adminHelper } from 'src/helper/admin-helper.service';
import { roleHelper } from 'src/helper/role-helper.service';
import { App404Exception, AppException, AppExistedException } from 'src/middleware/app-error-handler';
import { ConditionWhere } from 'src/types/query.type';
import { GenerateUtil } from 'src/utils/generate.utils';
import { HashUtil } from 'src/utils/hash';
import { QueryUtil } from 'src/utils/query';
import { ILike, Not } from 'typeorm';

@Injectable()
export class AdminService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(CACHE_MANAGER) private cacheManager: CacheStore,
  ) {}

  login = async (body: LoginAdminDto) => {
    const admin = await Admin.findOne({
      where: { username: body.username },
      select: ['id', 'username', 'password'],
    });
    if (!admin) throw new App404Exception('username', body);

    const isPasswordMatch = await HashUtil.comparePassword(body.password, admin.password);
    if (!isPasswordMatch) throw new AppException(ERROR_MSG.PASSWORD_NOT_CORRECT);

    const data = await HashUtil.signAccessToken(admin.id, admin.username, this.jwtService);
    const cacheKeyAuth = GenerateUtil.keyAuth(data.payload);
    await this.cacheManager.del(cacheKeyAuth);

    return data;
  };

  changePassword = async (adminId: number, body: ChangePasswordAdminDto): Promise<boolean> => {
    let admin = await Admin.findOne({
      where: { id: adminId },
      select: ['id', 'password'],
    });

    if (!admin) throw new App404Exception('adminId', { adminId });

    const isPasswordMatch = await HashUtil.comparePassword(body.oldPassword, admin.password);
    if (!isPasswordMatch) throw new AppException(ERROR_MSG.OLD_PASSWORD_NOT_CORRECT);

    if (body.oldPassword === body.newPassword) throw new AppException(ERROR_MSG.HAVE_NOT_ANY_CHANGE);
    admin.password = await HashUtil.hashPassword(body.newPassword);
    admin = await admin.save();
    return !!admin;
  };

  findById = async (id: number, permissions) => {
    const admin = await Admin.findOne({
      where: { id },
      select: {
        role: {
          code: true,
          name: true,
          isActive: true,
        },
      },
      relations: { role: true },
    });
    if (!admin) throw new App404Exception('id', { id });

    return { ...admin, permissions };
  };

  create = async (creatorId: number, body: CreateNewAdminDto): Promise<boolean> => {
    const creator = await Admin.findOneBy({ id: creatorId });
    if (!creator) throw new App404Exception('creatorId', { creatorId });

    const usernameExisted = await adminHelper.isUserNameExisted(body.username);
    if (usernameExisted) throw new AppExistedException('username', body);

    const role = await roleHelper.getRoleByCode(RoleCode.USER);
    if (!role) throw new App404Exception('roleCode', body);

    let newAdmin = new Admin();
    newAdmin.username = body.username;
    newAdmin.email = body.email;
    newAdmin.fullName = body.fullName;
    newAdmin.address = body.address;
    newAdmin.phoneNumber = body.phoneNumber;
    newAdmin.password = await HashUtil.hashPassword(body.password);
    newAdmin.roleId = role.id;
    newAdmin.parentId = creator.id;
    newAdmin.parent = creator;
    newAdmin = await newAdmin.save();

    return !!newAdmin;
  };

  getAll = async (query: GetAllAdminDto): Promise<PageDto<GetUploadListResponse>> => {
    let adminWhere: ConditionWhere<Admin> = {};

    if (query.fullName != undefined) {
      adminWhere = { ...adminWhere, fullName: ILike(`%${query.fullName}%`) };
    }
    if (query.phoneNumber != undefined) {
      adminWhere = { ...adminWhere, phoneNumber: ILike(`%${query.phoneNumber}%`) };
    }
    if (query.email != undefined) {
      adminWhere = { ...adminWhere, email: ILike(`%${query.email}%`) };
    }

    const [data, itemCount] = await Admin.findAndCount({
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
      where: {
        isSupperAdmin: false,
        ...adminWhere,
      },
      order: QueryUtil.getSort(query.orderBy, query.sortBy),
      skip: query.skip,
      take: query.take,
    });

    const pageMetaDto = new PageMetaDto({
      itemCount,
      pageOptionsDto: query,
    });

    return new PageDto(data as any, pageMetaDto);
  };

  getDetail = async (id: number): Promise<any> => {
    const adminWhere: ConditionWhere<Admin> = { id };

    const admin = await Admin.findOne({
      select: {
        id: true,
        fullName: true,
        username: true,
        phoneNumber: true,
        email: true,
        address: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { ...adminWhere },
    });

    if (!admin) throw new App404Exception('id', { id });

    return admin;
  };

  edit = async (id: number, body: UpdateAdminDto): Promise<any> => {
    const admin = await Admin.findOneBy({ id });
    if (!admin) throw new App404Exception('id', { id });

    if (body.fullName != undefined) {
      admin.fullName = body.fullName;
    }
    if (body.dateOfBirth != undefined) {
      admin.dateOfBirth = body.dateOfBirth;
    }
    if (body.gender != undefined) {
      admin.gender = body.gender;
    }

    return !!(await admin.save());
  };

  delete = async (id: number): Promise<boolean> => {
    const admin = await Admin.findOneBy({ id, role: { code: Not(RoleCode.ADMIN_SYSTEM) } });
    if (!admin) throw new App404Exception('id', { id });

    const cacheKeyAuth = GenerateUtil.keyAuth({ sub: id, username: admin.username });
    await this.cacheManager.del(cacheKeyAuth);

    return !!(await admin.remove());
  };
}
