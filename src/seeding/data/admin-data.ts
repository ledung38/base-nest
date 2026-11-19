import { Gender } from 'src/constant/enum-common';
import { SeedingConst } from 'src/constant/seeding';
import { Admin } from 'src/entities/admin.entity';

// Default password is: Admin@123 (hashed with bcrypt)
export const AdminData: Partial<Admin>[] = [
  {
    id: SeedingConst.ADMIN_SYSTEM_ID,
    username: 'admin',
    email: 'admin@base.local',
    password: '$2b$10$BSb3semiKnAhYdEZXNHRU.B0WLZ5KHRxBl1jT6fPcJJglrqp0Fcfe',
    fullName: 'System Administrator',
    gender: Gender.MALE,
    dateOfBirth: new Date('1990-01-01'),
    isSupperAdmin: true,
    roleId: SeedingConst.ROLE_ADMIN_SYSTEM_ID,
  },
];
