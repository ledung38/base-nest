import { Gender } from 'src/constant/enum-common';
import { SeedingConst } from 'src/constant/seeding';
import { Admin } from 'src/entities/admin.entity';

// Default password is: Admin@123 (hashed with bcrypt)
export const AdminData: Partial<Admin>[] = [
  {
    id: SeedingConst.ADMIN_SYSTEM_ID,
    username: 'admin',
    email: 'admin@base.local',
    password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    fullName: 'System Administrator',
    gender: Gender.MALE,
    dateOfBirth: new Date('1990-01-01'),
    isSupperAdmin: true,
    roleId: SeedingConst.ROLE_ADMIN_SYSTEM_ID,
  },
];
