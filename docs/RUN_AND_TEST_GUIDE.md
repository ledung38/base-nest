# 🧪 Hướng Dẫn Chạy & Kiểm Thử Hệ Thống (Run & Test Guide)
## FinTrade Backend (Pha 1, Pha 2 & Pha 3)

> **Mục tiêu tài liệu**: Hướng dẫn chi tiết từng bước để khởi chạy cụm hạ tầng Docker, chạy ứng dụng NestJS, kiểm thử tự động (Unit Test), kiểm thử trực tiếp luồng dữ liệu thật từ Binance WebSocket + Kafka (Pha 3) và hệ thống Sổ Cái Kép (Pha 2).

---

## 1. Thống Kê Hiện Trạng Kiểm Thử (Test Matrix)

| Hạng mục | Loại Test | Trạng thái | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Biên dịch TypeScript (`nest build`)** | Build Check | ✅ Đã test & PASS | Không có lỗi biên dịch |
| **`AccountService` (Pha 2)** | Unit Test (Jest, Mock DB) | ✅ Đã test & PASS (8/8) | Test `faucet`, `lockBalance`, `unlockBalance`, `auditAccount` (khớp & lệch sổ cái) |
| **`CandleAggregatorService` (Pha 3)** | Unit Test (Jest) | ✅ Đã test & PASS (4/4) | Test khởi tạo symbols, tạo nến đầu tiên, cập nhật OHLCV, đóng nến khi sang khung mới |
| **`BinanceIngestionService` (Pha 3)** | Live Smoke Test (4 giây) | ✅ Đã test & PASS | Kết nối thật tới Binance WSS, nhận >200 ticks/3s cho BTC/ETH/SOL, gom nến 1m thực tế |
| **Docker Stack (5 containers)** | Integration / Runtime | ⏳ Chạy trực tiếp theo hướng dẫn bên dưới | Cần bật Docker Desktop trên máy bạn |
| **PostgreSQL Migration & Seeding** | Integration / Runtime | ⏳ Chạy trực tiếp theo hướng dẫn bên dưới | Tạo bảng `admin`, `role`, `account`, `ledger_entry` |
| **REST APIs qua Swagger UI** | Manual / E2E Test | ⏳ Chạy trực tiếp theo hướng dẫn bên dưới | Test `/api/market/*`, `/api/accounts/*`, `/api/admin/login` |
| **Kafka Producer -> Broker (`market.ticks`)** | Integration / Runtime | ⏳ Chạy trực tiếp theo hướng dẫn bên dưới | Xác minh message thật chảy vào Kafka bằng `kafka-console-consumer` |
| **`test/app.e2e-spec.ts` (`/health`)** | E2E Test | ⏳ Chưa chạy | Yêu cầu PostgreSQL & Redis đang bật |

> 💡 **Lưu ý trên Windows PowerShell**: Nếu gặp lỗi `npm.ps1 cannot be loaded because running scripts is disabled`, hãy thay lệnh `npm` bằng `npm.cmd` (ví dụ: `npm.cmd run test`, `npm.cmd run start:dev`).

---

## 2. Chạy Kiểm Thử Tự Động (Không Cần Docker / Database)

Bạn có thể chạy ngay lập tức để kiểm tra logic cốt lõi của Pha 2 và Pha 3:

```bash
# Chạy toàn bộ Unit Tests (12/12 tests)
npm.cmd run test

# Chạy riêng từng module
npm.cmd run test -- account.service.spec.ts
npm.cmd run test -- candle-aggregator.service.spec.ts

# Kiểm tra build TypeScript
npm.cmd run build
```

---

## 3. Khởi Động Cụm Hạ Tầng Docker (Pha 1)

### Bước 1: Đảm bảo Docker Desktop đang chạy và file `.env` đã tồn tại
Kiểm tra file `.env` ở thư mục gốc (nếu chưa có thì copy từ `.env.example`):
```bash
copy .env.example .env
```

### Bước 2: Khởi động 5 container hạ tầng
```bash
docker-compose -f docker-compose-dev.yml up -d
```

### Bước 3: Kiểm tra trạng thái các container
```bash
docker ps
```
Cần thấy đủ 5 container đang ở trạng thái `Up`:
1. `id-database-pg-dev` — PostgreSQL 15 (`localhost:5432`)
2. `id-redis-dev` — Redis 7 (`localhost:6379`)
3. `id-rabbitmq-dev` — RabbitMQ 3.13 (`localhost:5672`, Management UI: `http://localhost:15672` — `guest` / `guest`)
4. `id-kafka-dev` — Apache Kafka 3.7 KRaft (`localhost:9092`)
5. `id-centrifugo-dev` — Centrifugo v5 (`http://localhost:8001` — password: `Admin@123`)

---

## 4. Khởi Tạo Database & Chạy Ứng Dụng Backend

### Bước 1: Chạy Migration tạo các bảng CSDL
```bash
npm.cmd run migration
```
Lệnh này sẽ chạy:
- `1700000000000-init-base-tables.ts` (tạo bảng `admin`, `role`, `permission`, `upload`, ...)
- `1710000000000-create-ledger-tables.ts` (tạo bảng `account` và `ledger_entry` chuẩn `numeric(28, 8)`)

### Bước 2: Seed dữ liệu ban đầu (Super Admin)
```bash
npm.cmd run seed
```
> Tài khoản Super Admin mặc định: `admin` / `Admin@123`.

### Bước 3: Khởi động NestJS Dev Server
```bash
npm.cmd run start:dev
```

**Log mong đợi trên Terminal khi khởi động thành công:**
```text
[Nest] ... LOG [MarketKafkaService] Kafka Producer successfully connected to [localhost:9092]
[Nest] ... LOG [BinanceIngestionService] Connecting to Binance WebSocket: wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade
[Nest] ... LOG [BinanceIngestionService] Binance WebSocket Connected successfully! Subscribed to [btcusdt, ethusdt, solusdt]
[Nest] ... VERBOSE [main] ====== App url: http://localhost:8000/api
[Nest] ... VERBOSE [main] ====== Swagger url: http://localhost:8000/api-docs
```

> ⚠️ **Lưu ý quan trọng về Log Tick Binance**:  
> `BinanceIngestionService` **chủ động không `console.log` từng tick** vì Binance bắn hàng chục đến hàng trăm tick/giây, nếu in hết sẽ làm tràn console và tốn CPU I/O. Để quan sát dữ liệu tick đang chạy thực tế, hãy dùng các API ở **Mục 5** hoặc đọc trực tiếp từ Kafka ở **Mục 5.2**.

---

## 5. Hướng Dẫn Test Pha 3: Binance WebSocket, Nến OHLCV & Kafka

Các endpoint của Pha 3 là **Public API**, không cần đăng nhập. Bạn có thể gọi trực tiếp trên trình duyệt, `curl.exe`, Postman hoặc **Swagger UI** (`http://localhost:8000/api-docs`).

### 5.1. Test qua REST API / Swagger UI

1. **Kiểm tra trạng thái đường truyền Binance & Kafka**:
   - `GET http://localhost:8000/api/market/pipeline-status`
   - Kết quả mong đợi:
     - `binanceIngestion.status`: `"CONNECTED"`
     - `binanceIngestion.totalTicksReceived`: Số lớn hơn 0 và **tăng liên tục** mỗi lần bấm F5/refresh.
     - `kafkaPipeline.connected`: `true` (nếu Kafka container đang chạy; nếu tắt Kafka thì là `false` và app vẫn chạy bình thường ở fallback mode).

2. **Xem danh sách các cặp coin hỗ trợ**:
   - `GET http://localhost:8000/api/market/symbols`

3. **Xem giá khớp mới nhất (Real-time Ticker)**:
   - Tất cả các cặp: `GET http://localhost:8000/api/market/tickers`
   - Riêng 1 cặp: `GET http://localhost:8000/api/market/ticker/BTCUSDT`
   - Gọi lại sau 2-3 giây sẽ thấy `price`, `quantity`, `tradeId`, `timestamp` cập nhật liên tục theo sàn Binance thật.

4. **Xem dữ liệu nến OHLCV đang được gom theo thời gian thực**:
   - Nến 1 giây (nhảy nhanh nhất để dễ quan sát):
     `GET http://localhost:8000/api/market/candles?symbol=BTCUSDT&interval=1s&limit=10`
   - Nến 1 phút:
     `GET http://localhost:8000/api/market/candles?symbol=BTCUSDT&interval=1m&limit=10`
   - Chờ vài giây rồi gọi lại: Bạn sẽ thấy các cây nến cũ có `isClosed: true` và cây nến cuối cùng có `isClosed: false`, `tradesCount` và `volume` đang tăng dần.

### 5.2. Xem Dữ Liệu Tick Thật Đang Chảy Trong Apache Kafka

Mở một cửa sổ terminal mới và chạy lệnh consumer trực tiếp bên trong container Kafka:

```bash
# Xem trực tiếp các tick đang được bắn vào topic market.ticks (kèm partition & key)
docker exec -it id-kafka-dev /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic market.ticks \
  --property print.key=true \
  --property print.partition=true \
  --max-messages 10
```

Bạn sẽ thấy output tương tự:
```text
Partition:1	BTCUSDT	{"symbol":"BTCUSDT","price":"64634.30","quantity":"0.001","timestamp":...}
Partition:2	ETHUSDT	{"symbol":"ETHUSDT","price":"1810.03","quantity":"0.846","timestamp":...}
```
> Quan sát cột `Partition` và `Key`: Tất cả message của `BTCUSDT` sẽ luôn rơi vào **cùng 1 partition cố định** (đúng như thiết kế ADR 10).

Để xem các cây nến đã đóng trong topic `market.candles`:
```bash
docker exec -it id-kafka-dev /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic market.candles \
  --property print.key=true \
  --max-messages 5
```

---

## 6. Hướng Dẫn Test Pha 2: Tài Khoản & Sổ Cái Kép (Financial Ledger)

Mở Swagger UI tại `http://localhost:8000/api-docs` và thực hiện theo đúng trình tự:

### Bước 1: Đăng nhập lấy JWT Token
- Gọi `POST /api/admin/login`:
  ```json
  {
    "username": "admin",
    "password": "Admin@123"
  }
  ```
- Copy giá trị `token` trong response.
- Bấm nút **Authorize** (góc trên bên phải Swagger UI) $\rightarrow$ dán `token` vào ô `Value` $\rightarrow$ bấm **Authorize**.

### Bước 2: Kiểm tra số dư ban đầu
- Gọi `GET /api/accounts/balances`
- Hệ thống tự động khởi tạo 4 ví (`BTC`, `ETH`, `SOL`, `USDT`) với số dư `"0.00000000"`.

### Bước 3: Nạp tiền Sandbox (Faucet) & Test Validation
- **Case hợp lệ (Happy Path)** — Gọi `POST /api/accounts/faucet`:
  ```json
  {
    "currency": "USDT",
    "amount": "10000.00000000"
  }
  ```
  $\rightarrow$ Thành công, trả về `account` có `availableBalance: "10000.00000000"` và 1 bản ghi `ledgerEntry` (`CREDIT`, `AVAILABLE`, `FAUCET`).
- **Case không hợp lệ (Test `@IsSwaggerFinancialDecimal`)**:
  - Thử gửi `"amount": "-500"` hoặc `"amount": "abc"` hoặc `"amount": "10.123456789"` (9 chữ số thập phân) $\rightarrow$ Phải trả về HTTP **400 Bad Request**.

### Bước 4: Xem lịch sử Sổ Cái Kép (Ledger History)
- Gọi `GET /api/accounts/ledger?currency=USDT`
- Kiểm tra bản ghi `FAUCET` vừa tạo có đầy đủ `transactionId`, `direction: "CREDIT"`, `balanceType: "AVAILABLE"`, `balanceAfter: "10000.00000000"`.

### Bước 5: Test Thuật Toán Tự Kiểm Toán (Self-Audit)
1. **Khi dữ liệu toàn vẹn**:
   - Gọi `GET /api/accounts/audit/USDT`
   - Kết quả: `"isConsistent": true`, `"diffAvailable": "0.00000000"`, `"diffLocked": "0.00000000"`.
2. **Thử nghiệm phát hiện gian lận / sai lệch (Optional - Rất hay để demo phỏng vấn!)**:
   - Cố tình sửa lén số dư trong PostgreSQL (không ghi ledger):
     ```bash
     docker exec -it id-database-pg-dev psql -U postgres -d fintrade_db -c "UPDATE account SET available_balance = '99999.00000000' WHERE currency = 'USDT';"
     ```
   - Gọi lại `GET /api/accounts/audit/USDT` $\rightarrow$ Hệ thống lập tức báo:
     ```json
     {
       "isConsistent": false,
       "storedAvailableBalance": "99999.00000000",
       "calculatedAvailableFromLedger": "10000.00000000",
       "diffAvailable": "89999.00000000"
     }
     ```
   - Trả lại số dư đúng sau khi test xong:
     ```bash
     docker exec -it id-database-pg-dev psql -U postgres -d fintrade_db -c "UPDATE account SET available_balance = '10000.00000000' WHERE currency = 'USDT';"
     ```

---

## 7. Hướng Dẫn Test Pha 4: Đặt Lệnh, Idempotency & RabbitMQ

> Đảm bảo bạn đã chạy `npm.cmd run migration` để tạo bảng `order` mới và đã Authorize JWT Token trên Swagger UI (`http://localhost:8000/api-docs`).

1. **Kiểm tra trạng thái RabbitMQ Queue**:
   - Gọi `GET /api/orders/queue-status`
   - Kiểm tra `rabbitmq.connected === true`, topology gồm `orders.queue`, `orders.dlx`, `orders.dlq`, `fintrade.events`.
   - Có thể mở giao diện quản trị RabbitMQ tại `http://localhost:15672` (`guest` / `guest`) $\rightarrow$ tab **Queues and Streams** để thấy `orders.queue` và `orders.dlq`.
2. **Đặt lệnh LIMIT BUY (Happy Path)**:
   - Đảm bảo ví `USDT` đã có `10000.00000000` (qua `/api/accounts/faucet`).
   - Gọi `POST /api/orders` với header `Idempotency-Key: ord-test-001` và body:
     ```json
     {
       "symbol": "BTCUSDT",
       "side": "BUY",
       "type": "LIMIT",
       "price": "65000.00000000",
       "quantity": "0.10000000"
     }
     ```
   - Response trả về `202 Accepted` với `status: "QUEUED"`, `idempotentReplay: false`.
   - Gọi `GET /api/orders/{id}` ngay sau đó $\rightarrow$ Worker RabbitMQ đã xử lý xong: `status: "PENDING"`, `lockedCurrency: "USDT"`, `lockedAmount: "6500.00000000"`.
   - Gọi `GET /api/accounts/balances` $\rightarrow$ Thấy USDT: `availableBalance: "3500.00000000"`, `lockedBalance: "6500.00000000"`.
   - Gọi `GET /api/accounts/audit/USDT` $\rightarrow$ `isConsistent: true`!
3. **Test chống click đúp (Idempotency Replay)**:
   - Gửi lại y hệt `POST /api/orders` với cùng header `Idempotency-Key: ord-test-001`.
   - Response trả về `idempotentReplay: true` và **cùng `order.id` cũ**, không sinh thêm lệnh mới và không bị trừ tiền lần 2!
4. **Test không đủ số dư (Business Rejection — không đẩy DLQ)**:
   - Gửi `POST /api/orders` với `Idempotency-Key: ord-test-002` mua `10 BTC` (`650,000 USDT`).
   - Gọi `GET /api/orders/{id}` $\rightarrow$ Thấy `status: "REJECTED"` kèm `rejectReason: "Số dư khả dụng không đủ..."`. Kiểm tra `orders.dlq` trên RabbitMQ UI vẫn bằng `0`.
5. **Test hủy lệnh & hoàn tiền ký quỹ (Cancel Order)**:
   - Gọi `DELETE /api/orders/{id_cua_ord_test_001}`.
   - Lệnh chuyển sang `status: "CANCELLED"`, `lockedAmount: "0.00000000"`.
   - Kiểm tra lại `GET /api/accounts/balances` $\rightarrow$ `6500.00000000 USDT` đã quay lại `availableBalance: "10000.00000000"`!

---

## 8. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

1. **Lỗi PowerShell không chạy được `npm`**:
   - Dùng `npm.cmd` thay cho `npm` (ví dụ `npm.cmd run start:dev`).
2. **Kafka chưa kết nối được khi vừa chạy `docker-compose up -d`**:
   - Kafka cần khoảng 10–15 giây để khởi động KRaft controller. Nếu NestJS bật lên trước và báo `Operating in fallback mode`, chỉ cần khởi động lại NestJS sau vài giây.
3. **Dừng toàn bộ hạ tầng Docker sau khi test xong**:
   ```bash
   docker-compose -f docker-compose-dev.yml down
   ```
   *(Thêm `-v` nếu muốn xóa sạch dữ liệu DB/Redis để làm lại từ đầu).*
