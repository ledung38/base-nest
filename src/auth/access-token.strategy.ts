import { CACHE_MANAGER, CacheStore } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { ENV } from 'src/config/environment';
import { CacheAdmin, JWTPayload } from 'src/dto/common-request.dto';
import { Admin } from 'src/entities/admin.entity';
import { App404Exception } from 'src/middleware/app-error-handler';
import { ExtractUtil } from 'src/utils/extract';
import { GenerateUtil } from 'src/utils/generate.utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: CacheStore) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ENV.JWT.JWT_SECRET,
    } as StrategyOptions);
  }

  async validate(payload: JWTPayload) {
    const cacheKeyAuth = GenerateUtil.keyAuth(payload);
    let cacheAdmin: CacheAdmin = await this.cacheManager.get(cacheKeyAuth);

    if (!cacheAdmin) {
      const admin = await Admin.findOne({
        where: { id: payload.sub },
        relations: {
          role: {
            rolePermissions: {
              permission: true,
            },
          },
        },
      });

      if (!admin) {
        throw new App404Exception('sub', payload);
      }

      const actions = await ExtractUtil.roleActions(admin.role);

      cacheAdmin = {
        userId: admin.id,
        username: admin.username,
        fullName: admin.fullName,
        roleId: admin.roleId,
        roleName: admin.role?.name,
        roleCode: admin.role?.code,
        isSupperAdmin: admin.isSupperAdmin,
        actions,
      };
      await this.cacheManager.set(cacheKeyAuth, cacheAdmin, { ttl: 86400 });
    }

    return cacheAdmin;
  }
}
