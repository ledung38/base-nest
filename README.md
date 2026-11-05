# Enterprise NestJS Boilerplate (`base-nestjs`)

A robust, production-ready, enterprise-grade NestJS starter kit featuring Authentication, RBAC, TypeORM Data Mapper, Redis Caching, S3 File Storage, Pagination, Winston Logger, Swagger, and Docker.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: `>= 20.x`
- **Docker & Docker Compose** (PostgreSQL & Redis)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Environment Configuration

```bash
cp .env.example .env
```

_(Adjust the database credentials and secrets in `.env` if necessary)_

### Step 3: Start Local Infrastructure (Docker)

```bash
docker-compose -f docker-compose-dev.yml up -d
```

### Step 4: Run Database Migration & Seeding

```bash
# Run TypeORM migration (creates base tables)
npm run migration

# Seed initial roles, permissions, and super admin account
npm run seed
```

> Default Super Admin: `admin` / `Admin@123`

### Step 5: Start Development Server

```bash
npm run start:dev
```

- **App URL**: `http://localhost:8000/api`
- **Swagger Documentation**: `http://localhost:8000/api-docs`
- **Health Check**: `http://localhost:8000/api/health`

---

## 🛠 Database & Migration Guide

```bash
# Create a new migration file
npm run migration:create --name=add_user_avatar

# Run all pending migrations
npm run migration

# Revert the latest migration
npm run migration:revert

# Run database seeder
npm run seed
```

---

## 📁 Project Architecture

```
src/
├── api/                   # Feature Controllers & Services
│   ├── admin/             # Admin & User CRUD, profile, change password
│   ├── role/              # Role management & permissions
│   └── upload/            # Upload controller & storage integration
├── auth/                  # JWT Strategy, Access Token Guard, Permission Guard
├── config/                # Environment & Database configuration
├── constant/              # System constants, Enums, Error codes, Roles
├── decorator/             # Swagger decorators (@IsSwaggerString), Api decorators
├── dto/                   # Data Transfer Objects, Pagination DTOs (PageDto)
├── entities/              # TypeORM entities (Admin, Role, Permission, Upload)
├── helper/                # AdminHelper, RoleHelper, UploadHelper
├── job/                   # Scheduled Cron jobs (DB backup, storage clean)
├── middleware/            # Error handler (AppErrorHandler), Request logger
├── migrations/            # Clean TypeORM migration scripts
├── seeding/               # Initial data seeding scripts
├── types/                 # TypeScript custom types
└── utils/                 # Utilities (DateUtil, HashUtil, StringUtil, QueryUtil, S3Storage)
```

---

## 🔒 Security & Best Practices

- **Password Hashing:** 100% Bcrypt salted hashing (one-way).
- **JWT Protection:** Proper token validation and expiration checking.
- **Role-Based Access Control:** Role & Permission guard.
- **Swagger Documentation:** Auto-generated API specs with rich decorators.

hi
