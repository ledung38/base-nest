import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminHelper } from 'src/helper/admin-helper.service';
import { JwtStrategy } from './access-token.strategy';

// Process is: Strategy -> guard
@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [JwtStrategy, AdminHelper],
})
export class AuthModule {}
