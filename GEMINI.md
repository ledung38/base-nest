# Hướng dẫn dự án: FinTrade Backend
## High-Throughput Algorithmic Trading & Paper-Trading Engine

> **Mục tiêu dự án**: Xây dựng nền tảng sàn giao dịch mô phỏng (Paper-Trading) và chạy bot thuật toán thời gian thực trên dữ liệu thật của Binance (BTC, ETH, SOL). Dự án phục vụ mục tiêu học tập chuyên sâu và chuẩn bị phỏng vấn Senior/Lead Backend & System Design (tập trung vào: *Tính toàn vẹn dữ liệu tài chính, Event-Driven Architecture, High-Throughput Streaming, Concurrency Control và Quản lý tài nguyên tối ưu trên 1 máy host*).

---

## 1. Công nghệ & Thư viện chính (Tech Stack)

- **Framework & Runtime**:
  - **NestJS v10** (nền tảng Express), Node.js (`>= 20.x`), TypeScript Strict Mode.
- **Database, Caching & Ledger**:
  - **PostgreSQL 15**: Lưu trữ dữ liệu giao dịch, tài khoản và Sổ cái kép (Double-Entry Ledger).
  - **TypeORM v0.3**: Data Mapper pattern, quản lý Transaction, Row-Level Locking (`SELECT FOR UPDATE`), Migrations có versioning.
  - **Redis 7**: Cache, Distributed Lock (Idempotency Key), In-Memory Orderbook & Rate Limiting.
- **Message Brokers & Streaming**:
  - **Apache Kafka 3.7 (KRaft Mode)**: Data Plane - Xử lý luồng dữ liệu thị trường trực tiếp tốc độ cao (topic `market.ticks`, `market.candles`). Chạy không cần ZooKeeper, JVM Heap giới hạn `<= 512MB`.
  - **RabbitMQ 3.13 (Alpine)**: Transaction Plane - Hàng đợi tiếp nhận và xử lý lệnh giao dịch tin cậy (`orders.queue`, `orders.dlq`, manual ack, publisher confirms).
- **Realtime Gateway**:
  - **Centrifugo v5**: Dedicated WebSocket Server bằng Go (tách biệt khỏi Node.js Event Loop, footprint siêu nhẹ `~30MB RAM`, bảo vệ hiệu năng backend).
- **Thư viện Chuyên dụng Tài chính & Hạ tầng**:
  - **`bignumber.js`**: Tính toán số dư, giá, khối lượng (loại trừ 100% lỗi sai số dấu phẩy động IEEE 754 của JavaScript).
  - **`ws`**: WebSocket Client hiệu năng cao kết nối Binance Public Stream.
  - **`class-validator` & `class-transformer`**: Xác thực và chuẩn hóa DTO.
  - **`@nestjs/swagger`**: Tự động sinh tài liệu OpenAPI / Swagger UI.
  - **`winston` & `winston-daily-rotate-file`**: Logging hệ thống đa cấp độ.
  - **`jest` & `ts-jest`**: Unit Testing & E2E Testing.

---

## 2. Cấu trúc thư mục (Architecture & Directory Structure)

```text
fintrade-be/
├── docs/                        # Tài liệu kỹ thuật chuyên sâu & Hướng dẫn học tập
│   ├── ENGINEERING_LOG.md       # Sổ tay ghi nhận quyết định kiến trúc (ADR)
│   └── NESTJS_TYPEORM_GUIDE.md  # Cẩm nang NestJS, TypeORM, Decorators & DI
├── src/
│   ├── api/                     # Các module tính năng (Feature Modules)
│   │   ├── account/             # Quản lý tài khoản, số dư, nạp sandbox, tự kiểm toán sổ cái
│   │   ├── market/              # Ingestion Binance, Kafka Producer, Rolling Candle Aggregator
│   │   ├── order/               # (Pha 4) Tiếp nhận lệnh, Idempotency key, RabbitMQ Order Queue
│   │   ├── matching/            # (Pha 5) Sổ lệnh In-Memory, Matching Engine, Quyết toán Trade
│   │   ├── admin/               # Quản lý Admin & Đăng nhập
│   │   ├── role/                # Phân quyền Role & Permission
│   │   └── upload/              # Xử lý upload media
│   ├── auth/                    # JWT Strategy, AccessTokenGuard, PermissionGuard
│   ├── config/                  # Cấu hình Environment, TypeORM DataSource, Swagger
│   ├── constant/                # Hằng số hệ thống, Enums (`trading.enum.ts`, `entity-name.ts`)
│   ├── decorator/               # Custom Decorators (`api.decorator.ts`, `swagger.decorator.ts`, `auth.decorator.ts`)
│   ├── dto/                     # Data Transfer Objects chia theo domain (`account-dto/`, `market-dto/`)
│   ├── entities/                # TypeORM Entities (`account.entity.ts`, `ledger-entry.entity.ts`, v.v.)
│   ├── helper/                  # Các service trợ giúp dùng chung
│   ├── job/                     # Scheduled Cron Jobs
│   ├── middleware/              # Error Handler tập trung, Request Logger Middleware
│   ├── migrations/              # Lịch sử Migration CSDL (TypeORM)
│   ├── seeding/                 # Scripts khởi tạo dữ liệu mẫu ban đầu
│   ├── types/                   # Custom TypeScript types
│   ├── utils/                   # Hàm tiện ích (Date, Hash, BigNumber, String)
│   ├── app.module.ts            # Root Module
│   └── main.ts                  # Entry point của ứng dụng
├── docker-compose-dev.yml       # Cụm container Local (Postgres, Redis, RabbitMQ, Kafka, Centrifugo)
├── centrifugo.json              # File cấu hình namespace cho Centrifugo
├── .env.example                 # Mẫu biến môi trường chuẩn
├── package.json                 # Quản lý dependencies & scripts
└── GEMINI.md                    # File quy ước dự án cho AI & Developer
```

---

## 3. Lệnh vận hành (Commands)

### 3.1. Quản lý Hạ tầng (Docker Compose)
- Khởi động toàn bộ cụm hạ tầng:
  ```bash
  docker-compose -f docker-compose-dev.yml up -d
  ```
- Kiểm tra trạng thái các container:
  ```bash
  docker ps
  ```
- Tắt cụm container:
  ```bash
  docker-compose -f docker-compose-dev.yml down
  ```

### 3.2. Quản lý Ứng dụng & Database
- Cài đặt dependencies:
  ```bash
  npm install   # Trên Windows PowerShell nếu bị chặn script, dùng: npm.cmd install
  ```
- Chạy Database Migration:
  ```bash
  npm run migration
  ```
- Revert Migration gần nhất:
  ```bash
  npm run migration:revert
  ```
- Tạo Migration mới:
  ```bash
  npm run migration:create --name=ten_migration
  ```
- Chạy Seeding tài khoản Admin mặc định (`admin` / `Admin@123`):
  ```bash
  npm run seed
  ```
- Chạy môi trường Development (Watch mode):
  ```bash
  npm run start:dev
  ```
- Biên dịch Production Build:
  ```bash
  npm run build
  ```

### 3.3. Kiểm thử & Chất lượng Code (Testing & Quality)
- Chạy toàn bộ Unit Tests:
  ```bash
  npm run test
  ```
- Chạy Unit Test file cụ thể:
  ```bash
  npm run test -- account.service.spec.ts
  npm run test -- candle-aggregator.service.spec.ts
  ```
- Kiểm tra Linter & Format code:
  ```bash
  npm run lint
  npm run format
  ```

---

## 4. Quy ước bắt buộc (DOs & DONTs)

### ✅ DO (Quy chuẩn Bắt Buộc Tuân Thủ):

1. **Chuẩn Tính toán Số học Tài chính (Financial Arithmetic)**:
   - **BẮT BUỘC dùng `BigNumber.js`** cho mọi phép cộng, trừ, nhân, chia, so sánh số dư, giá khớp và khối lượng.
   - Các cột số dư trong Database BẮT BUỘC định nghĩa kiểu `numeric(28, 8)` (tối đa 28 chữ số, 8 số thập phân).
   - Trong DTO, số tiền BẮT BUỘC nhận dưới dạng chuỗi (`string`) và sử dụng custom decorator `@IsSwaggerFinancialDecimal()`.

2. **Chuẩn Toàn vẹn Dữ liệu & Sổ Cái Kép (Double-Entry Ledger)**:
   - MỌI biến động số dư (`faucet`, `lockBalance`, `unlockBalance`, `settleTrade`) BẮT BUỘC phải sinh ra bản ghi `LedgerEntry` (lưu rõ `direction`: CREDIT/DEBIT, `balanceType`: AVAILABLE/LOCKED, và snapshot `balanceAfter`).
   - MỌI thao tác thay đổi số dư BẮT BUỘC phải bọc trong Database Transaction với **Pessimistic Write Lock (`SELECT FOR UPDATE` / `pessimistic_write`)** để loại trừ 100% rủi ro Race Condition khi user hoặc bot click đúp lệnh.

3. **Chuẩn Phân tầng Message Broker**:
   - Khi bắn dữ liệu tick vào Kafka topic `market.ticks`, **BẮT BUỘC truyền `key = tick.symbol`** để đảm bảo dữ liệu của cùng 1 cặp coin luôn vào cùng 1 partition cố định, bảo toàn trật tự tuần tự thời gian.
   - Luồng đặt lệnh giao dịch BẮT BUỘC đi qua RabbitMQ (Durable queue, Manual Ack, Dead Letter Queue).

4. **Tái sử dụng Custom Decorators của Boilerplate**:
   - Controller: Dùng `@IsAuthController(path, tag, isRequireAuth)`.
   - Method response: Dùng `@ApiHandleResponse()` cho single response, `@ApiPaginatedResponse()` cho danh sách phân trang.
   - DTO properties: Dùng `@IsSwaggerString()`, `@IsSwaggerNumber()`, `@IsSwaggerEnum()`, `@IsSwaggerFinancialDecimal()`.

5. **Chất lượng Code & Testing**:
   - Luôn đặt tên file theo chuẩn `kebab-case.ts`, tên Class theo `PascalCase`, biến/hàm theo `camelCase`, hằng số theo `UPPER_SNAKE_CASE`.
   - Mỗi Service nghiệp vụ mới BẮT BUỘC phải có file Unit Test (`.spec.ts`) tương ứng đi kèm, test đầy đủ cả happy path và edge cases (ví dụ: test số dư không đủ, số âm, lệch sổ cái).
   - Luôn cập nhật quyết định kỹ thuật mới vào file [`docs/ENGINEERING_LOG.md`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/docs/ENGINEERING_LOG.md).

---

### ❌ DONT (Những Điều Tuyệt Đối Cấm):

1. **CẤM DÙNG SỐ FLOAT JAVASCRIPT CHO TIỀN TỆ**:
   - Tuyệt đối không dùng kiểu `number` của JS (`0.1 + 0.2 === 0.30000000000000004`) để tính tiền hay lưu trong Entity tài chính. Điều này gây lỗi thất thoát tiền tệ (Penny Leakage).
2. **CẤM GHI RAW TICK VÀO POSTGRESQL**:
   - Tuyệt đối không thực thi câu lệnh SQL `INSERT` cho từng tick Binance nhận về. 5,000 tick/s sẽ làm cháy IOPS ổ cứng và chết Database. Tick chỉ được xử lý In-Memory và gom thành nến 1m trước khi lưu.
3. **CẤM UPDATE ĐÈ SỐ DƯ MÀ KHÔNG GHI SỔ CÁI**:
   - Tuyệt đối không viết `UPDATE accounts SET available_balance = available_balance - 100` mà không sinh bản ghi tương ứng trong `ledger_entries`.
4. **CẤM BỎ QUA IDEMPOTENCY KEY TRONG LỆNH GIAO DỊCH**:
   - Mọi request đặt lệnh bắt buộc phải có `Idempotency-Key` (lưu TTL trong Redis) để chống trùng lặp lệnh do người dùng click đúp hoặc do mạng retry.
5. **CẤM TỰ Ý CÀI THÊM PACKAGE NGOÀI**:
   - Không tự ý cài đặt package npm mới nếu các thư viện hiện có (`kafkajs`, `amqplib`, `bignumber.js`, `ws`, `typeorm`, `axios`, v.v.) đã đủ đáp ứng. Bất kỳ package mới nào cũng phải được cân nhắc kỹ để tránh làm nặng bộ nhớ trên máy host.
6. **CẤM DÙNG KIỂU `any` BỪA BÃI**:
   - Không được dùng `any` để tắt kiểm tra kiểu của TypeScript. Mọi payload, event, entity phải có Interface / Type rõ ràng.
7. **CẤM TỰ TẠO INSTANCE REPOSITORY BẰNG `new`**:
   - Bắt buộc tuân thủ nguyên lý Dependency Injection (DI) của NestJS (`@InjectRepository` hoặc `this.dataSource.transaction(...)`), không tự `new Repository()`.

