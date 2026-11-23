# 📋 Báo Cáo Bàn Giao & Trạng Thái Dự Án (Project Handover)
## FinTrade Backend: High-Throughput Algorithmic Trading & Paper-Trading Engine

> **Ngày cập nhật**: 23/11/2026  
> **Trạng thái tổng thể**: Đã hoàn thành **Pha 1, Pha 2, Pha 3, Pha 4, Pha 5, Pha 6, Pha 7** và toàn bộ tài liệu kỹ thuật chuyên sâu (22 ADRs). Hệ thống biên dịch sạch (`build: 0 error`), toàn bộ unit test đạt 100% (**73/73 tests pass** trên 12 test suites). Sẵn sàng bắt đầu **Pha 8 (Containerize, Kubernetes K3s & Prometheus/Grafana Metrics)**.

---

## 1. Trạng Thái Hiện Tại (Current Status)

| Thành phần | Trạng thái | Chi tiết |
| :--- | :--- | :--- |
| **Hạ tầng Docker** | ✅ Hoàn tất | Postgres 15, Redis 7, RabbitMQ 3.13, Kafka 3.7 (KRaft), Centrifugo v5 |
| **Pha 1: Core Setup** | ✅ Hoàn tất | Config environment type-safe, cài đặt các package lõi, Centrifugo config |
| **Pha 2: Sổ Cái Kép (Ledger)** | ✅ Hoàn tất | Entities `Account` & `LedgerEntry`, Pessimistic Lock, Faucet, Audit tự động (8/8 tests pass) |
| **Pha 3: Market Data & Kafka** | ✅ Hoàn tất | Ingestion Binance WebSocket, Dedicated Partition Mapping cho Kafka (`BTCUSDT: 0`, `ETHUSDT: 1`, `SOLUSDT: 2`), In-memory Rolling Candle (12/12 tests pass) |
| **Pha 4: Order & RabbitMQ** | ✅ Hoàn tất | Entity `Order` + Migration, Redis + DB Idempotency 2 tầng, RabbitMQ (Publisher Confirms, Manual Ack, DLX/DLQ), Worker khóa tiền & Hủy lệnh (13/13 tests pass) |
| **Pha 5: Matching Engine** | ✅ Hoàn tất | In-Memory Orderbook (Price-Time Priority), Khớp lệnh lai (P2P + Simulated Binance Liquidity), Hoàn trả ký quỹ thặng dư (Price Improvement), Quyết toán sổ cái kép (13/13 tests pass) |
| **Pha 6: Centrifugo Gateway** | ✅ Hoàn tất | Realtime Gateway với Centrifugo, HMAC-SHA256 JWT auth, Leading + Trailing Edge 100ms Depth Throttling, multi-channel broadcast (14/14 tests pass) |
| **Pha 7: Trading Bot Engine** | ✅ Hoàn tất | Bot Grid Trading & Chiến thuật EMA Cross (9/21), Khôi phục bot khi restart, 7 REST APIs (13/13 tests pass) |
| **Pha 8: K3s Deployment** | ⏳ **Sẵn sàng triển khai** | Dockerfile multi-stage, K3s manifests, Prometheus & Grafana Metrics, tối ưu RAM $\le$ 8GB |

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
- [x] `MarketKafkaService` (`src/api/market/market-kafka.service.ts`): Kafka Producer với Dedicated Partition Mapping (`BTCUSDT: 0`, `ETHUSDT: 1`, `SOLUSDT: 2`), bảo toàn trật tự tuần tự thời gian; graceful fallback khi broker offline.
- [x] `CandleAggregatorService` (`src/api/market/candle-aggregator.service.ts`): Gom nến In-Memory (1s, 1m, 15m) từ luồng tick, lưu Ring Buffer 500 nến cho chart TradingView mà không làm nghẽn DB.
- [x] `BinanceIngestionService` (`src/api/market/binance-ingestion.service.ts`): WebSocket kết nối Binance combined streams, tự phục hồi bằng Exponential Backoff và Circuit Breaker.
- [x] `MarketController` (`src/api/market/market.controller.ts`): Public REST APIs lấy symbols, ticker, candles, pipeline status.
- [x] Unit Tests: `candle-aggregator.service.spec.ts` (4/4 pass), `market-kafka.service.spec.ts` (4/4 pass), `binance-ingestion.service.spec.ts` (4/4 pass).

### 2.4. Order Pipeline & RabbitMQ (Pha 4)
- [x] Entity `Order` (`src/entities/order.entity.ts`) + Migration `1720000000000-create-order-table.ts`.
- [x] `OrderService` (`src/api/order/order.service.ts`):
  - Cơ chế chống trùng lặp lệnh 2 tầng: Redis TTL distributed lock + Postgres unique constraint.
  - Bắn lệnh vào RabbitMQ Exchange `fintrade.orders` (Durable, Publisher Confirms).
- [x] `OrderConsumerService` (`src/api/order/order-consumer.service.ts`):
  - Hàng đợi tin cậy `orders.queue`, gắn Dead Letter Exchange `orders.dlx` / `orders.dlq`.
  - Manual Ack/Nack an toàn, gọi `AccountService.lockBalance` với `pessimistic_write` lock.
- [x] Unit Test `order.service.spec.ts`: **13/13 tests pass**.

### 2.5. High-Throughput Matching Engine & Quyết Toán (Pha 5)
- [x] Entity `Trade` (`src/entities/trade.entity.ts`) + Migration `1730000000000-create-trade-table.ts`.
- [x] `Orderbook` (`src/api/matching/orderbook.ts`): Sổ lệnh In-Memory cấu trúc Bids (giảm dần) / Asks (tăng dần) ưu tiên Giá - Thời gian (Price-Time Priority).
- [x] `MatchingService` (`src/api/matching/matching.service.ts`):
  - Khớp lệnh lai (Hybrid Matching): Khớp P2P giữa các tài khoản nội bộ và Simulated Binance Market Liquidity khi có tick mới.
  - Hoàn trả ký quỹ thặng dư (Price Improvement Refund): Khách mua được giá rẻ hơn giá Limit được hoàn trả phần dôi dư về ví khả dụng ngay lập tức.
  - Quyết toán sổ cái kép (Atomic Double-Entry Settlement): Lưu trade và trừ/cộng số dư đồng thời.
- [x] Unit Tests: `orderbook.spec.ts` (6/6 pass), `matching.service.spec.ts` (7/7 pass).

### 2.6. Realtime Gateway với Centrifugo & Client Throttling (Pha 6)
- [x] `RealtimeService` (`src/api/realtime/realtime.service.ts`): Giao tiếp Centrifugo HTTP API (`/publish`, `/broadcast`), sinh Connection Token & Subscription Token HMAC-SHA256 an toàn.
- [x] `OrderbookThrottler` (`src/api/realtime/throttler/orderbook-throttler.ts`): Cơ chế Leading + Trailing edge điều tiết tần số cập nhật độ sâu L2 tối đa 10 updates/s (100ms throttle), bảo vệ trình duyệt client không bị nghẽn DOM.
- [x] `RealtimeConsumerService` (`src/api/realtime/realtime-consumer.service.ts`): Kết nối pipeline dữ liệu thị trường và kết quả khớp lệnh để broadcast đa kênh (`public:ticks`, `public:orderbook`, `public:trades`, `public:candles`, `personal:<userId>`).
- [x] Unit Tests: `orderbook-throttler.spec.ts` (4/4 pass), `realtime.service.spec.ts` (6/6 pass), `realtime-consumer.service.spec.ts` (4/4 pass).

### 2.7. Automated Trading Bot Engine (Pha 7)
- [x] Entity `BotConfig` (`src/entities/bot-config.entity.ts`) + Migration `1740000000000-create-bot-config-table.ts`: Quản lý cấu hình, trạng thái PnL và thông số bot.
- [x] Helper `ema.ts` (`src/api/bot/indicators/ema.ts`): Tính EMA 9, EMA 21 thuần số học với `bignumber.js`, phát hiện Golden Cross & Death Cross.
- [x] `GridTradingWorker` (`src/api/bot/workers/grid-trading.worker.ts`):
  - Rải lưới đa tầng theo khoảng giá số học bằng `bignumber.js`.
  - Bắt sự kiện `trade.executed` để tự động đặt lệnh SELL đối ứng chốt lời ở tầng trên (khi BUY khớp) hoặc mua lại ở tầng dưới (khi SELL khớp).
  - Tự động cộng dồn `realizedPnl` và đếm `totalTrades`.
- [x] `EmaCrossWorker` (`src/api/bot/workers/ema-cross.worker.ts`):
  - Đánh giá tín hiệu xu hướng CHỈ trên nến đã đóng (`isClosed === true`), triệt tiêu 100% bẫy tín hiệu giả (Whipsaw).
  - Tự động phát lệnh MARKET BUY / MARKET SELL vào RabbitMQ khi xuất hiện giao cắt vàng hoặc tử thần.
- [x] `BotService` & `BotController` (`src/api/bot/`):
  - Khởi tạo, dừng, xoá và theo dõi hiệu suất bot.
  - Tự động phục hồi các bot đang chạy (`restoreActiveBots`) khi server khởi động lại.
- [x] Unit Tests: `ema.spec.ts` (5/5 pass), `bot.service.spec.ts` (5/5 pass), `grid-trading.worker.spec.ts` (3/3 pass).

### 2.8. Hệ Thống Tài Liệu Kỹ Thuật (Architecture Decision Records)
- [x] `docs/ENGINEERING_LOG.md` & `ENGINEERING_LOG.md`: 22 bản ghi quyết định kiến trúc (ADR 01 $\rightarrow$ ADR 22) giải thích cặn kẽ bối cảnh, lý do chọn giải pháp và phân tích ưu nhược điểm phục vụ ôn luyện phỏng vấn Senior/Lead.
- [x] `docs/NESTJS_TYPEORM_GUIDE.md`: Cẩm nang chuyên sâu về NestJS, TypeORM, Dependency Injection, DataSource, EntityManager, QueryRunner và các Decorator trong dự án.
- [x] `GEMINI.md`: Bộ quy tắc cốt lõi, kiến trúc, tech stack, lệnh vận hành và các quy định DO/DONT bắt buộc.

---

## 3. Các Bước Tiếp Theo Cần Triển Khai (Next Steps)

### 👉 Nhiệm vụ sắp tới: **Pha 8 - Containerize, Kubernetes (K3s) Deployment & Metrics Monitoring**
1. **Multi-Stage Dockerfile Tối Ưu**:
   - Viết `Dockerfile` phân tầng (Builder $\rightarrow$ Runner) trên nền `node:20-alpine`, dung lượng image $< 200\text{MB}$.
   - Khởi chạy NestJS ở chế độ production với `dumb-init` xử lý tín hiệu OS gracefully.
2. **K3s Manifests (Cụm Local Nhẹ)**:
   - Viết các Kubernetes manifests (`deployment.yaml`, `service.yaml`, `configmap.yaml`, `secret.yaml`, `hpa.yaml`).
   - Thiết lập tài nguyên `resources.requests` & `resources.limits` cho từng thành phần, đảm bảo toàn bộ cụm tiêu thụ $\le 8\text{GB RAM}$.
3. **Health Checks & Graceful Shutdown**:
   - Tích hợp `@nestjs/terminus` cung cấp endpoint `/health/liveness` và `/health/readiness`.
   - Cơ chế Graceful Shutdown đóng an toàn kết nối Binance WS, Kafka Producer, RabbitMQ Channels và TypeORM pool khi Pod bị Terminate.
4. **Prometheus & Grafana Monitoring**:
   - Tích hợp Prometheus metrics client (`w3tec94/nestjs-prometheus` hoặc `prom-client`) thu thập:
     - TPS (Transactions Per Second).
     - Độ trễ khớp lệnh (Matching Latency in $\mu s / ms$).
     - Độ sâu hàng đợi RabbitMQ (`orders.queue` depth).
     - Bộ nhớ Node.js Heap & Event Loop Lag.

---

## 4. Lệnh Kiểm Tra Nhanh Hệ Thống (Quick Health Checks)

```bash
# 1. Chạy toàn bộ Unit Tests (hiện có 73/73 tests PASS - 12 test suites)
npm.cmd run test

# 2. Kiểm tra biên dịch TypeScript
npm.cmd run build

# 3. Chạy test riêng từng feature module
npm.cmd run test -- ema.spec.ts
npm.cmd run test -- grid-trading.worker.spec.ts
npm.cmd run test -- bot.service.spec.ts
npm.cmd run test -- realtime
npm.cmd run test -- matching.service.spec.ts
npm.cmd run test -- order.service.spec.ts
npm.cmd run test -- account.service.spec.ts
npm.cmd run test -- candle-aggregator.service.spec.ts
npm.cmd run test -- market-kafka.service.spec.ts

# 4. Khởi động hạ tầng Docker
docker-compose -f docker-compose-dev.yml up -d

# 5. Chạy dev server
npm.cmd run start:dev
# Swagger UI: http://localhost:8000/api-docs
```
