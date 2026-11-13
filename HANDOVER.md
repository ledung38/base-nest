# 📋 Báo Cáo Bàn Giao & Trạng Thái Dự Án (Project Handover)
## FinTrade Backend: High-Throughput Algorithmic Trading & Paper-Trading Engine

> **Ngày cập nhật**: 13/11/2026  
> **Trạng thái tổng thể**: Đã hoàn thành xuất sắc **Pha 1, Pha 2, Pha 3** và toàn bộ hệ thống tài liệu/quy chuẩn code. Hệ thống biên dịch sạch (`build: 0 error`), toàn bộ unit test đạt 100% (12/12 tests pass). Sẵn sàng bắt đầu **Pha 4**.

---

## 1. Trạng Thái Hiện Tại (Current Status)

| Thành phần | Trạng thái | Chi tiết |
| :--- | :--- | :--- |
| **Hạ tầng Docker** | ✅ Hoàn tất | Postgres 15, Redis 7, RabbitMQ 3.13, Kafka 3.7 (KRaft), Centrifugo v5 |
| **Pha 1: Core Setup** | ✅ Hoàn tất | Config environment type-safe, cài đặt các package lõi, Centrifugo config |
| **Pha 2: Sổ Cái Kép (Ledger)** | ✅ Hoàn tất | Entities `Account` & `LedgerEntry`, Pessimistic Lock, Faucet, Audit tự động |
| **Pha 3: Market Data & Kafka** | ✅ Hoàn tất | Ingestion Binance WebSocket, Kafka Producer (`key = symbol`), Rolling Candle Aggregator |
| **Pha 4: Order & RabbitMQ** | ⏳ **Sẵn sàng triển khai** | Tiếp nhận lệnh, Redis Idempotency, RabbitMQ Order Queue |
| **Pha 5: Matching Engine** | ⏳ Kế hoạch | In-memory Orderbook (Redis), Price-Time Priority, Trade Settlement |
| **Pha 6: Centrifugo Gateway** | ⏳ Kế hoạch | Broadcast tick, depth và sự kiện khớp lệnh ra frontend Next.js |
| **Pha 7: Trading Bot** | ⏳ Kế hoạch | Bot Grid Trading & Chiến thuật EMA Cross |
| **Pha 8: K3s Deployment** | ⏳ Kế hoạch | Dockerfile multi-stage, K3s manifests, tối ưu RAM $\le$ 8GB |

---

## 2. Các Việc Đã Làm Chi Tiết

### 2.1. Hạ tầng & Cấu hình Core (Pha 1)
- [x] Cấu hình `docker-compose-dev.yml` gồm 5 dịch vụ tối ưu tài nguyên trên 1 máy host: PostgreSQL, Redis, RabbitMQ (port 5672/15672), Kafka KRaft (port 9092, JVM $\le$ 512MB), Centrifugo (port 8001, ~30MB RAM).
- [x] Tạo file `centrifugo.json` với 2 namespace: `public` (bảng giá, nến, sổ lệnh) và `personal` (biến động số dư & lệnh cá nhân).
- [x] Cấu hình typed environment trong `src/config/environment.ts` và file `.env`.
- [x] Cài đặt các thư viện: `kafkajs`, `amqplib`, `bignumber.js`, `ws`.

### 2.2. Financial Ledger & Sổ Cái Kép (Pha 2)
- [x] Định nghĩa Enums tại `src/constant/trading.enum.ts` (`CurrencyEnum`, `BalanceTypeEnum`, `LedgerDirectionEnum`, `LedgerReferenceTypeEnum`).
- [x] Entity `Account` (`src/entities/account.entity.ts`): Cột `available_balance` và `locked_balance` chuẩn `numeric(28, 8)`.
- [x] Entity `LedgerEntry` (`src/entities/ledger-entry.entity.ts`): Lưu vết biến động dòng tiền bất biến, snapshot `balance_after`.
- [x] Migration `1710000000000-create-ledger-tables.ts`: Đã tạo bảng và index tối ưu truy vấn đối soát.
- [x] `AccountService` (`src/api/account/account.service.ts`):
  - Dùng **Pessimistic Write Lock (`SELECT FOR UPDATE`)** chống Race Condition khi đặt nhiều lệnh cùng lúc.
  - Phép tính số học bằng `bignumber.js` (loại trừ 100% lỗi sai số float IEEE 754).
  - Nghiệp vụ: `faucet`, `lockBalance`, `unlockBalance`, `settleTrade`, `auditAccount` (thuật toán tự kiểm toán $\sum \text{CREDIT} - \sum \text{DEBIT} \equiv \text{Balance}$).
- [x] Custom Decorator `@IsSwaggerFinancialDecimal()` tại `src/decorator/swagger.decorator.ts`.
- [x] Unit Test `account.service.spec.ts`: **8/8 tests pass**.

### 2.3. Binance Ingestion & Kafka Pipeline (Pha 3)
- [x] Định nghĩa Interfaces tại `src/api/market/market.interface.ts` (`MarketTick`, `Candlestick`, `MarketSymbolInfo`).
- [x] `MarketKafkaService` (`src/api/market/market-kafka.service.ts`): Kafka Producer bắn tick với `key = tick.symbol` đảm bảo 1 đồng coin luôn vào cùng 1 partition cố định (bảo toàn trật tự thời gian); cơ chế graceful fallback nếu broker offline.
- [x] `CandleAggregatorService` (`src/api/market/candle-aggregator.service.ts`): Gom nến In-Memory (1s, 1m, 15m) từ luồng tick, lưu Ring Buffer 500 nến cho chart TradingView mà không làm nghẽn DB.
- [x] `BinanceIngestionService` (`src/api/market/binance-ingestion.service.ts`): WebSocket kết nối Binance combined streams (`btcusdt`, `ethusdt`, `solusdt`), tự phục hồi bằng thuật toán Exponential Backoff và Circuit Breaker.
- [x] `MarketController` (`src/api/market/market.controller.ts`): Public REST APIs lấy symbols, ticker, candles, pipeline status.
- [x] Unit Test `candle-aggregator.service.spec.ts`: **4/4 tests pass**.

### 2.4. Hệ thống Tài liệu & Quy chuẩn Dự án
- [x] `GEMINI.md`: Bộ quy tắc cốt lõi, kiến trúc, tech stack, lệnh vận hành và các quy định DO/DONT bắt buộc (Financial arithmetic, No raw tick insert to DB, Idempotency, v.v.).
- [x] `docs/ENGINEERING_LOG.md`: 12 bản ghi quyết định kiến trúc (ADR 01 $\rightarrow$ ADR 12) giải thích cặn kẽ bối cảnh, lý do chọn giải pháp và phân tích ưu nhược điểm phục vụ ôn luyện phỏng vấn Senior/Lead.
- [x] `docs/NESTJS_TYPEORM_GUIDE.md`: Cẩm nang chuyên sâu về NestJS, TypeORM, Dependency Injection, DataSource, EntityManager, QueryRunner và các Decorator trong dự án.

---

## 3. Các Bước Tiếp Theo Cần Triển Khai (Next Steps)

### 👉 Nhiệm vụ sắp tới: **Pha 4 - Order Submission & RabbitMQ Processing**
1. **Thiết kế Entity `Order`**:
   - Bảng `orders`: `id`, `user_id`, `idempotency_key` (Unique), `symbol`, `side` (BUY/SELL), `type` (LIMIT/MARKET), `price`, `quantity`, `filled_quantity`, `status` (PENDING, FILLED, CANCELLED, REJECTED).
   - Migration tạo bảng `orders` và các index.
2. **Cơ chế Idempotency qua Redis**:
   - Chặn người dùng hoặc bot click đúp lệnh trong vòng TTL (ví dụ 120s). Nếu trùng key, trả về kết quả lệnh trước đó hoặc báo lỗi duplicate.
3. **RabbitMQ Order Queue**:
   - Kết nối RabbitMQ Producer đẩy lệnh giao dịch vào queue `orders.queue` (durable = true, publisher confirms).
   - Cấu hình Dead Letter Queue (`orders.dlq`) để chứa các message lỗi xử lý.
4. **RabbitMQ Consumer Worker**:
   - Lắng nghe lệnh từ `orders.queue` với cơ chế **Manual Ack**.
   - Kiểm tra số dư và gọi `AccountService.lockBalance` an toàn.
   - Chuyển trạng thái lệnh sang `PENDING` và chuyển tiếp sang Matching Engine.

---

## 4. Lệnh Kiểm Tra Nhanh Hệ Thống (Quick Health Checks)

```bash
# 1. Chạy toàn bộ Unit Tests (hiện có 12/12 tests PASS)
npm.cmd run test

# 2. Kiểm tra biên dịch TypeScript
npm.cmd run build

# 3. Chạy test riêng từng service
npm.cmd run test -- account.service.spec.ts
npm.cmd run test -- candle-aggregator.service.spec.ts

# 4. Khởi động hạ tầng Docker
docker-compose -f docker-compose-dev.yml up -d

# 5. Chạy dev server
npm.cmd run start:dev
# Swagger UI: http://localhost:8000/api-docs
```

---

## 5. Danh Sách Tài Liệu Tham Chiếu

- Quy chuẩn dự án: [`GEMINI.md`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/GEMINI.md)
- Nhật ký quyết định kiến trúc (ADRs): [`docs/ENGINEERING_LOG.md`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/docs/ENGINEERING_LOG.md)
- Cẩm nang NestJS & TypeORM: [`docs/NESTJS_TYPEORM_GUIDE.md`](file:///d:/WORKSPACE/dsc/fintech/fintrade-be/docs/NESTJS_TYPEORM_GUIDE.md)
- Kế hoạch tổng thể 8 giai đoạn: [`fintrade_implementation_plan.md`](file:///C:/Users/dung.lh/.gemini/antigravity/brain/384c5f90-7340-4e5f-a8d8-ddd6601c1864/fintrade_implementation_plan.md)

