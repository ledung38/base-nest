# 📘 FinTrade Engineering & Architecture Journal
> **Mục tiêu tài liệu**: Ghi nhận toàn bộ quá trình thiết kế, triển khai kỹ thuật, các quyết định kiến trúc (**Architecture Decision Records - ADR**), phân tích lý do chọn giải pháp và so sánh các phương án thay thế. Tài liệu này đóng vai trò như **sổ tay học tập và chuẩn bị phỏng vấn Senior/Lead Backend & System Design**.

---

## 📌 MỤC LỤC
1. [Tổng quan Dự án & Tầm nhìn Kỹ thuật](#1-tổng-quan-dự-án--tầm-nhìn-kỹ-thuật)
2. [Pha 1: Kiến trúc Hạ tầng Phân tán (Infrastructure ADRs)](#2-pha-1-kiến-trúc-hạ-tầng-phân-tán-infrastructure-adrs)
   - [ADR 01: Tách bạch Data Plane (Kafka) và Transaction Plane (RabbitMQ)](#adr-01-tách-bạch-data-plane-kafka-và-transaction-plane-rabbitmq)
   - [ADR 02: Loại bỏ đồng Synthetic Token ($MYCOIN)](#adr-02-loại-bỏ-đồng-synthetic-token-mycoin)
   - [ADR 03: Chọn Centrifugo thay vì Socket.io nhúng](#adr-03-chọn-centrifugo-thay-vì-socketio-nhúng)
   - [ADR 04: Kafka KRaft Mode tối ưu tài nguyên trên 1 host](#adr-04-kafka-kraft-mode-tối-ưu-tài-nguyên-trên-1-host)
3. [Pha 2: Sổ Cái Kép & Tính Toàn Vẹn Tài Chính (Financial Ledger ADRs)](#3-pha-2-sổ-cái-kép--tính-toàn-vẹn-tài-chính-financial-ledger-adrs)
   - [ADR 05: Single-Balance Update vs Double-Entry Bookkeeping](#adr-05-single-balance-update-vs-double-entry-bookkeeping)
   - [ADR 06: Concurrency Control: Pessimistic Lock (`SELECT FOR UPDATE`) vs Optimistic Lock](#adr-06-concurrency-control-pessimistic-lock-select-for-update-vs-optimistic-lock)
   - [ADR 07: Xử lý số học tài chính: `numeric(28, 8)` & `BigNumber.js` vs Float](#adr-07-xử-lý-số-học-tài-chính-numeric28-8--bignumberjs-vs-float)
   - [ADR 08: Thiết kế trạng thái số dư kép: `available_balance` & `locked_balance`](#adr-08-thiết-kế-trạng-thái-số-dư-kép-available_balance--locked_balance)
   - [ADR 09: Cơ chế Tự kiểm toán (Live Ledger Self-Audit Algorithm)](#adr-09-cơ-chế-tự-kiểm-toán-live-ledger-self-audit-algorithm)
4. [Pha 3: Dữ liệu Thị trường Binance & Kafka Pipeline (Market Data ADRs)](#4-pha-3-dữ-liệu-thị-trường-binance--kafka-pipeline-market-data-adrs)
   - [ADR 10: Chiến lược Phân vùng Kafka (Partitioning by Symbol)](#adr-10-chiến-lược-phân-vùng-kafka-partitioning-by-symbol)
   - [ADR 11: Quản lý Kết nối WebSocket Binance & Tự phục hồi (Auto-Reconnect Backoff)](#adr-11-quản-lý-kết-nối-websocket-binance--tự-phục-hồi-auto-reconnect-backoff)
   - [ADR 12: Gom Nến Thời Gian Thực (In-Memory OHLCV Aggregation) vs Ghi Trực Tiếp DB](#adr-12-gom-nến-thời-gian-thực-in-memory-ohlcv-aggregation-vs-ghi-trực-tiếp-db)
5. [Pha 4: Đặt Lệnh, Chống Trùng Lặp & RabbitMQ Transaction Plane (Order ADRs)](#5-pha-4-đặt-lệnh-chống-trùng-lặp--rabbitmq-transaction-plane-order-adrs)
   - [ADR 13: Idempotency 2 Tầng (Redis Fast-Path + PostgreSQL Unique Index)](#adr-13-idempotency-2-tầng-redis-fast-path--postgresql-unique-index)
   - [ADR 14: RabbitMQ Topology Chuẩn Giao Dịch (Publisher Confirms, Manual Ack, DLX/DLQ)](#adr-14-rabbitmq-topology-chuẩn-giao-dịch-publisher-confirms-manual-ack-dlxdlq)
   - [ADR 15: Máy Trạng Thái Lệnh Bất Đồng Bộ & Market Data Stale Circuit Breaker](#adr-15-máy-trạng-thái-lệnh-bất-đồng-bộ--market-data-stale-circuit-breaker)

---

## 1. Tổng quan Dự án & Tầm nhìn Kỹ thuật

- **Tên dự án**: FinTrade Engine
- **Bản chất**: High-Throughput Algorithmic Trading & Paper-Trading Platform.
- **Bối cảnh**: Hệ thống tiếp nhận luồng dữ liệu thị trường trực tiếp từ Binance WebSocket (BTC/USDT, ETH/USDT, SOL/USDT), quản lý sổ lệnh thời gian thực, xử lý giao dịch tài chính chuẩn ACID, vận hành bot tự động (Grid Trading, EMA Cross) và stream dữ liệu về Trading Terminal (Next.js).
- **Ràng buộc phần cứng**: Vận hành toàn bộ hệ sinh thái (K3s/Docker, DB, Kafka, RabbitMQ, Redis, Centrifugo, Backend Services) trên **1 máy tính cá nhân làm host server**, giới hạn tổng RAM tiêu thụ từ **6GB - 8GB**.

---

## 2. Pha 1: Kiến trúc Hạ tầng Phân tán (Infrastructure ADRs)

### ADR 01: Tách bạch Data Plane (Kafka) và Transaction Plane (RabbitMQ)

#### Bối cảnh:
Hệ thống sàn giao dịch có 2 loại dữ liệu với đặc tính hoàn toàn trái ngược nhau:
1. **Market Data Stream (Dữ liệu giá)**: Tần suất cực cao (1,000 - 10,000 tick/s), có thể chấp nhận mất 1 vài tick nếu mạng chập chờn, cần cơ chế Pub/Sub nhiều consumer và lưu lại log lịch sử để tính nến OHLCV hoặc chạy backtest.
2. **Order Execution (Lệnh giao dịch & Tiền tệ)**: Tần suất thấp hơn nhiều so với tick giá, nhưng **tuyệt đối không được phép mất dù chỉ 1 message**. Cần đảm bảo thứ tự, cần xác nhận xử lý xong mới được xóa khỏi hàng đợi (Manual Ack), và cần đẩy vào Dead Letter Queue (DLQ) nếu gặp lỗi.

#### Quyết định:
- Sử dụng **Apache Kafka** cho luồng Market Data Stream.
- Sử dụng **RabbitMQ** cho luồng Transactional Order Queue.

#### So sánh & Lý do không chọn phương án khác:
- *Tại sao không dùng Kafka cho cả 2?*
  - Kafka mặc dù rất mạnh về throughput nhưng việc triển khai hàng đợi lệnh giao dịch (Transaction queue) phức tạp hơn: khó implement cơ chế Dead Letter Queue linh hoạt theo từng message lỗi, khó quản lý ack đơn lẻ cho từng lệnh (Kafka commit theo offset/batch).
- *Tại sao không dùng RabbitMQ cho cả 2?*
  - RabbitMQ xử lý fan-out dữ liệu hàng chục nghìn tick/s sẽ bị nghẽn RAM do lưu trữ message trong memory; RabbitMQ không có khả năng "replay" lại dữ liệu quá khứ như Kafka Offset để tính lại nến hay huấn luyện bot.

---

### ADR 02: Loại bỏ đồng Synthetic Token ($MYCOIN)

#### Bối cảnh:
Ý tưởng ban đầu là tạo ra 1 đồng token ảo nội bộ neo giá theo rổ BTC/ETH.

#### Quyết định:
Loại bỏ hoàn toàn $MYCOIN, giao dịch trực tiếp các cặp tiền thật mô phỏng (BTC/USDT, ETH/USDT, SOL/USDT) trên dữ liệu thực tế từ Binance.

#### Lý do:
- Đồng token ảo làm phân tán nghiệp vụ: Người phỏng vấn sẽ thắc mắc về tính kinh tế (Tokenomics, thanh khoản ảo, rủi ro trượt giá phi thực tế) thay vì tập trung vào kiến trúc hệ thống.
- Sử dụng dữ liệu thật từ Binance giúp kiểm chứng ngay lập tức: Chart nến của hệ thống khớp 100% với chart của Binance; bot chạy trên hệ thống có thể đối chiếu hiệu quả trực tiếp với thị trường thật.

---

### ADR 03: Chọn Centrifugo thay vì Socket.io nhúng

#### Bối cảnh:
Cần phân phối hàng ngàn tick giá và thông báo khớp lệnh về trình duyệt Next.js của người dùng theo thời gian thực.

#### Quyết định:
Sử dụng **Centrifugo v5** (viết bằng Go) làm Dedicated Realtime Gateway độc lập, giao tiếp với NestJS qua HTTP API.

#### Phân tích so sánh:
| Tiêu chí | Socket.io (Nhúng trong NestJS) | Centrifugo (Go Server độc lập) |
| :--- | :--- | :--- |
| **Tác động lên Node.js** | ⚠️ **Làm lag Event Loop**: Node.js vừa chạy logic vừa phải gánh socket serialization | 🚀 **Zero impact**: Node.js bắn 1 request HTTP/Redis, Centrifugo tự fan-out đa luồng |
| **Tiêu tốn RAM** | Tăng mạnh theo số lượng tab kết nối | Cực nhẹ: Binary Go chỉ tốn **~30MB RAM** |
| **Mô hình Channel** | Tự code logic room, join/leave thủ công | Hỗ trợ sẵn Namespace chuẩn sàn: `public:ticks:*`, `personal:user_id` |
| **Khả năng Scale** | Cần Redis Adapter phức tạp, duplicate data | Scale ngang độc lập với backend logic |

---

### ADR 04: Kafka KRaft Mode tối ưu tài nguyên trên 1 host

#### Bối cảnh:
Kafka truyền thống yêu cầu phải chạy kèm Apache ZooKeeper, ngốn ít nhất 2 cụm container và tiêu tốn tối thiểu 1.5GB - 2.5GB RAM.

#### Quyết định:
Sử dụng Kafka 3.7+ chạy chế độ **KRaft (Kafka Raft Metadata Mode)** không dùng ZooKeeper. Giới hạn JVM Heap ở mức:
`-Xms256m -Xmx512m`.

#### Kết quả:
Chỉ cần 1 container Kafka duy nhất, RAM hoạt động ổn định ở mức ~350MB - 450MB, giải phóng tài nguyên quý giá trên máy host cá nhân.

---

## 3. Pha 2: Sổ Cái Kép & Tính Toàn Vẹn Tài Chính (Financial Ledger ADRs)

### ADR 05: Single-Balance Update vs Double-Entry Bookkeeping

#### Vấn đề kinh điển của hệ thống CRUD thông thường:
Đa số các lập trình viên mới làm fintech thường thiết kế bảng `users`:
```sql
UPDATE users SET balance = balance - 100 WHERE id = 1;
```
**Tại sao cách này bị cấm tuyệt đối trong ngành ngân hàng và sàn giao dịch?**
1. **Mất dấu vết (Audit Trail = 0)**: Nếu số dư của user đột nhiên tăng thêm 10,000 USD (do bug phần mềm, lỗi mạng retry, hoặc bị can thiệp DB), bạn hoàn toàn không thể chứng minh hay truy vết xem số tiền đó từ đâu ra.
2. **Không thể đối soát (Reconciliation Impossible)**: Hệ thống kế toán tài chính yêu cầu: "Tổng tài sản của hệ thống luôn bằng Tổng nguồn vốn". Nếu chỉ có 1 con số dư duy nhất, bạn không bao giờ đối soát được sai lệch.

#### Quyết định: Áp dụng Sổ Cái Kép (Double-Entry Ledger)
Mọi biến động tiền tệ đều tuân theo nguyên tắc:
1. **Không bao giờ update đè số dư mà không có bằng chứng**: Bảng `accounts` lưu trạng thái hiện tại, nhưng bảng `ledger_entries` lưu lịch sử bất biến (Append-only).
2. **Cấu trúc 1 bản ghi Ledger**:
   - `accountId`: Tài khoản bị tác động.
   - `transactionId`: UUID nhóm các giao dịch liên quan lại với nhau (để đảm bảo Nợ/Có cân xứng).
   - `referenceId`: ID nghiệp vụ (Order ID, Deposit ID, Trade ID).
   - `referenceType`: Loại nghiệp vụ (`DEPOSIT`, `ORDER_LOCK`, `ORDER_UNLOCK`, `TRADE_SETTLEMENT`, `FEE`).
   - `balanceType`: Loại số dư tác động (`AVAILABLE` hoặc `LOCKED`).
   - `direction`: Hướng dòng tiền (`CREDIT` là cộng tiền, `DEBIT` là trừ tiền).
   - `amount`: Số lượng tiền biến động.
   - `balanceAfter`: Số dư snapshot ngay sau khi dòng tiền biến động (phục vụ đối soát chéo cực nhanh).

---

### ADR 06: Concurrency Control: Pessimistic Lock (`SELECT FOR UPDATE`) vs Optimistic Lock

#### Bài toán Race Condition (Đặt 2 lệnh cùng lúc):
User có $100 trong tài khoản. User mở 2 tab trình duyệt hoặc dùng bot gửi 2 request đặt lệnh mua $100 cùng 1 mili-giây:
- Request A đọc số dư: Có $100 $\rightarrow$ Đủ điều kiện.
- Request B đọc số dư: Có $100 $\rightarrow$ Đủ điều kiện.
- Request A trừ tiền: Còn $0.
- Request B trừ tiền: Thành âm -$100 (hoặc nếu có check constraint thì request B lỗi nhưng dữ liệu bị xung đột).

#### So sánh hai trường phái Concurrency:

| Tiêu chí | Optimistic Locking (`@VersionColumn`) | Pessimistic Locking (`SELECT FOR UPDATE`) |
| :--- | :--- | :--- |
| **Cơ chế** | Đọc tự do, khi ghi kiểm tra `version`. Nếu version đã đổi thì abort và retry | Khóa độc quyền bản ghi ở tầng Database ngay từ lúc đọc cho đến khi commit transaction |
| **Phù hợp** | Hệ thống đọc nhiều, ít va chạm ghi đồng thời (CMS, Blog, E-commerce cart) | **Hệ thống tài chính, ví tiền, sàn giao dịch**: Va chạm đồng thời cực kỳ cao |
| **Nhược điểm** | Khi có 10 lệnh bắn cùng lúc, 9 lệnh bị văng Exception `OptimisticLockVersionMismatchError`, client phải retry liên tục làm tăng tải hệ thống | Phải giữ lock trong thời gian ngắn nhất có thể; nếu query kéo dài dễ gây bottleneck DB |

#### Quyết định:
Sử dụng **Pessimistic Write Lock (`SELECT FOR UPDATE`)** trong TypeORM:
```typescript
const account = await queryRunner.manager
  .createQueryBuilder(Account, 'acc')
  .setLock('pessimistic_write')
  .where('acc.userId = :userId AND acc.currency = :currency', { userId, currency })
  .getOne();
```
- Khi Request A đang lock bản ghi tài khoản USDT của User 1, Request B sẽ phải chờ ở hàng đợi DB trong vài mili-giây.
- Sau khi Request A trừ tiền xong và commit, Request B đọc lại sẽ thấy số dư = 0 và bị từ chối một cách an toàn, tuyệt đối không bị âm tiền hay mất dữ liệu.

---

### ADR 07: Xử lý số học tài chính: `numeric(28, 8)` & `BigNumber.js` vs Float

#### Bẫy nguy hiểm của Javascript Number:
Trong Javascript, kiểu `number` tuân theo chuẩn dấu phẩy động 64-bit IEEE 754:
```javascript
console.log(0.1 + 0.2); // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3); // FALSE!
```
Nếu áp dụng kiểu số này cho sàn giao dịch, sau hàng triệu lượt khớp lệnh, tài khoản của bạn sẽ bị lệch tiền (Penny Leakage), không thể cân bằng sổ cái kế toán!

#### Quyết định:
1. **Ở Database (PostgreSQL)**:
   - Tất cả các cột số dư và giá trị tiền tệ sử dụng kiểu `numeric(28, 8)` (28 chữ số tổng cộng, 8 chữ số thập phân).
   - Không bao giờ dùng `float` hay `double precision`.
2. **Ở Backend (Node.js)**:
   - Toàn bộ phép tính cộng, trừ, nhân, chia, so sánh số dư đều bắt buộc dùng thư viện **`bignumber.js`**:
   ```typescript
   const newAvailable = new BigNumber(currentAvailable).minus(amount);
   if (newAvailable.isLessThan(0)) {
     throw new BadRequestException('INSUFFICIENT_AVAILABLE_BALANCE');
   }
   ```
   - Chuyển đổi sang `string` trước khi lưu vào TypeORM để bảo toàn nguyên vẹn độ chính xác.

---

### ADR 08: Thiết kế trạng thái số dư kép: `available_balance` & `locked_balance`

#### Bài toán:
Khi người dùng đặt 1 lệnh Limit Buy 0.1 BTC với giá $60,000 USDT (tổng giá trị $6,000 USDT):
- Lệnh này chưa khớp ngay, đang nằm chờ trên sổ lệnh (Orderbook).
- Người dùng không được phép dùng $6,000 USDT này để đi mua coin khác.
- Nhưng tiền này cũng chưa thực sự rời khỏi tài khoản của người dùng (chưa trừ hẳn).

#### Quyết định:
Mỗi tài khoản tiền tệ (`accounts`) duy trì 2 cột độc lập:
1. `available_balance`: Số dư khả dụng để rút tiền hoặc đặt lệnh mới.
2. `locked_balance`: Số dư đang bị ký quỹ/treo cho các lệnh chờ khớp (Open Orders).

**Quy trình dịch chuyển dòng tiền**:
1. **Khi đặt lệnh (Order Created)**:
   - `available_balance` $\rightarrow$ `- $6,000`
   - `locked_balance` $\rightarrow$ `+ $6,000`
   - Tổng tài sản (`available + locked`) vẫn giữ nguyên $6,000!
2. **Khi hủy lệnh (Order Cancelled)**:
   - `locked_balance` $\rightarrow$ `- $6,000`
   - `available_balance` $\rightarrow$ `+ $6,000`
3. **Khi lệnh khớp (Order Filled)**:
   - `locked_balance` của USDT $\rightarrow$ `- $6,000` (rời khỏi ví).
   - `available_balance` của BTC $\rightarrow$ `+ 0.1 BTC` (nhận coin vào ví khả dụng).

---

### ADR 09: Cơ chế Tự kiểm toán (Live Ledger Self-Audit Algorithm)

#### Bối cảnh:
Làm thế nào để chứng minh hệ thống của bạn không bị "lệch số dư" hay "hack tiền"?

#### Quyết định:
Cung cấp API Kiểm toán tự động (`/api/accounts/:id/audit`).
Thuật toán:
$$\text{Calculated Available} = \sum_{\text{AVAILABLE}} (\text{CREDIT}) - \sum_{\text{AVAILABLE}} (\text{DEBIT})$$
$$\text{Calculated Locked} = \sum_{\text{LOCKED}} (\text{CREDIT}) - \sum_{\text{LOCKED}} (\text{DEBIT})$$
So sánh với `account.available_balance` và `account.locked_balance`.
Nếu độ chênh lệch $\Delta \neq 0$, hệ thống lập tức phát cảnh báo đỏ và khóa tài khoản để điều tra.
> **Đây là điểm nhấn kỹ thuật cực mạnh khi bạn trình bày với các nhà tuyển dụng Fintech/Ngân hàng.**

---

## 4. Pha 3: Dữ liệu Thị trường Binance & Kafka Pipeline (Market Data ADRs)

### ADR 10: Chiến lược Phân vùng Kafka (Partitioning by Symbol)

#### Bối cảnh:
Một sàn giao dịch có hàng chục cặp tiền tệ (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`). Số lượng tick giá bắn về lên tới hàng nghìn message mỗi giây.
Nếu Kafka Topic `market.ticks` chỉ có 1 partition, toàn bộ hệ thống bị nghẽn cổ chai (Bottleneck) ở 1 consumer duy nhất. Nhưng nếu tăng partition lên 3, 5, 10 mà **không có Partition Key**, Kafka sẽ chia ngẫu nhiên (Round-Robin) các tick của cùng 1 đồng coin vào nhiều partition khác nhau.
- Hậu quả: Consumer A nhận tick BTC lúc 10:00:01, Consumer B nhận tick BTC lúc 10:00:00. Dữ liệu nến và giá bị xáo trộn trật tự thời gian (Out-of-order execution)!

#### Quyết định:
- Cấu hình topic `market.ticks` có nhiều partition (mặc định 3 partitions).
- **Bắt buộc dùng `symbol` làm Partition Key**:
  ```typescript
  await producer.send({
    topic: 'market.ticks',
    messages: [
      {
        key: tick.symbol, // BTCUSDT -> Partition cố định
        value: JSON.stringify(tick),
      },
    ],
  });
  ```
#### Lợi ích:
1. **Bảo toàn 100% trật tự thời gian**: Mọi tick của `BTCUSDT` sẽ luôn được định tuyến vào **cùng một partition duy nhất**, đảm bảo thứ tự thời gian tuyến tính tuyệt đối.
2. **Khả năng Scale ngang**: Consumer Group có thể mở rộng nhiều Worker (1 worker xử lý `BTCUSDT`, 1 worker xử lý `ETHUSDT`, v.v.) mà không hề bị xung đột hay tranh chấp dữ liệu.

---

### ADR 11: Quản lý Kết nối WebSocket Binance & Tự phục hồi (Auto-Reconnect Backoff)

#### Bối cảnh:
Kết nối mạng công cộng Internet tới Binance WebSocket (`stream.binance.com`) không bao giờ ổn định 100%. Các sự cố thường gặp:
- Đứt cáp quang, rớt mạng tạm thời (Network glitch).
- Binance định kỳ ngắt kết nối mỗi 24 giờ theo quy chuẩn WebSocket của họ.
- Tràn bộ đệm (Socket buffer overflow) khi đường truyền bị nghẽn.

#### Quyết định: Xây dựng cơ chế Auto-Reconnect với Exponential Backoff & Circuit Breaker
1. **Lắng nghe toàn diện các sự kiện**: `open`, `message`, `ping`, `pong`, `error`, `close`.
2. **Exponential Backoff**: Khi mất kết nối, hệ thống không retry điên cuồng ngay lập tức (dễ bị Binance chặn IP do nghi ngờ DDOS), mà tăng thời gian chờ dần:
   $$T_{\text{wait}} = \min(1000 \times 2^{\text{retryCount}}, 30000) \text{ ms}$$
3. **Heartbeat & Zombie Connection Detection**: Nếu sau 30 giây không nhận được bất kỳ ping/message nào từ Binance, worker chủ động ngắt kết nối cũ và tạo kết nối mới sạch sẽ.

---

### ADR 12: Gom Nến Thời Gian Thực (In-Memory OHLCV Aggregation) vs Ghi Trực Tiếp DB

#### Sai lầm phổ biến:
Nhiều lập trình viên mới làm thường viết code: Cứ mỗi tick Binance bắn về là lập tức thực thi câu lệnh SQL:
```sql
INSERT INTO ticks (symbol, price, quantity, timestamp) VALUES (...);
```
**Tại sao cách này làm chết Database ngay lập tức?**
- Thị trường sôi động có thể sinh ra 2,000 - 5,000 tick/giây.
- PostgreSQL không được thiết kế để chịu 5,000 transaction ghi đĩa mỗi giây trên 1 máy server cá nhân. Ổ đĩa IOPS sẽ chạm trần 100%, khóa connection pool, và toàn bộ API đặt lệnh của người dùng bị tê liệt!

#### Quyết định: Gom nến trong bộ nhớ (In-Memory Rolling Aggregator)
1. **Mô hình Rolling Window**:
   Duy trì cấu trúc nến hiện tại trong RAM:
   - `open`: Giá của tick đầu tiên trong khung giờ.
   - `high`: $\max(\text{high}, \text{current\_price})$.
   - `low`: $\min(\text{low}, \text{current\_price})$.
   - `close`: Giá của tick mới nhất.
   - `volume`: Tổng tích lũy khối lượng các giao dịch.
   - `tradesCount`: Số lượng giao dịch trong cây nến.
2. **Chuyển giao khi hết khung nến**:
   - Khung 1s / 1m kết thúc: Đóng nến cũ (`isClosed: true`), lưu vào Ring Buffer (hoặc Redis) và bắn vào Centrifugo để vẽ TradingView Chart.
   - Reset và mở cây nến mới với giá mở cửa kế thừa từ giá đóng cửa của cây nến trước.
3. **Kết quả**:
   - Giảm tải tải trọng ghi DB từ **hàng ngàn lần/giây** xuống chỉ còn **1 lần/phút** (nếu lưu nến 1m) hoặc chỉ lưu trong bộ nhớ đệm phục vụ hiển thị đồ thị!

---

## 5. Pha 4: Đặt Lệnh, Chống Trùng Lặp & RabbitMQ Transaction Plane (Order ADRs)

### ADR 13: Idempotency 2 Tầng (Redis Fast-Path + PostgreSQL Unique Index)

#### Bối cảnh:
Trong giao dịch tài chính, mạng chập chờn hoặc người dùng bấm đúp nút "Mua" 2 lần liên tiếp có thể gửi cùng một yêu cầu đặt lệnh lên backend nhiều lần. Nếu không có cơ chế chống trùng lặp (Idempotency), người dùng sẽ bị trừ tiền và mua gấp đôi số lượng coin mong muốn.

#### Quyết định: Cơ chế phòng thủ 2 lớp (Defense in Depth)
1. **Lớp 1 — Redis Fast-Path (TTL 120s)**:
   - Mọi request `POST /api/orders` **bắt buộc** truyền Header `Idempotency-Key` (UUID phía client sinh cho mỗi ý định đặt lệnh).
   - Khi request đầu tiên tới, backend đặt trạng thái `PROCESSING` trong Redis. Nếu request thứ 2 trùng key ập tới trong lúc request 1 đang chạy $\rightarrow$ trả về `409 Conflict` ngay lập tức.
   - Khi lệnh đã được đưa an toàn vào RabbitMQ, cập nhật Redis thành `COMPLETED` kèm snapshot object lệnh. Nếu mạng retry lại sau đó $\rightarrow$ trả về đúng kết quả lệnh cũ (`idempotentReplay: true`) mà không đụng vào DB hay RabbitMQ.
   - Nếu xảy ra lỗi validation hoặc RabbitMQ tạm ngưng trước khi lệnh vào hàng đợi $\rightarrow$ xóa khóa Redis để người dùng có thể retry sạch sẽ với cùng `Idempotency-Key`.
2. **Lớp 2 — PostgreSQL Unique Index (`IDX_order_idempotency_key`)**:
   - Đề phòng trường hợp Redis hết TTL hoặc bị restart, cột `idempotency_key` trong bảng `order` có ràng buộc `UNIQUE` tuyệt đối ở tầng CSDL.

---

### ADR 14: RabbitMQ Topology Chuẩn Giao Dịch (Publisher Confirms, Manual Ack, DLX/DLQ)

#### Bối cảnh:
Nếu API `POST /api/orders` trực tiếp thực hiện toàn bộ quy trình khóa ví, khớp lệnh đồng bộ trong 1 HTTP request, khi bot hoặc hàng nghìn người dùng đặt lệnh đồng loạt, DB connection pool sẽ quá tải và xảy ra timeout hàng loạt.

#### Quyết định: Tách bạch Tiếp nhận (API) và Thực thi (Worker) qua RabbitMQ
1. **Publisher Confirms (`createConfirmChannel` + `waitForConfirms`)**:
   - Producer chỉ trả về thành công cho client sau khi RabbitMQ xác nhận đã lưu message bền vững (`persistent: true`) xuống đĩa của `orders.queue` (`durable: true`).
2. **Manual Ack (`noAck: false`) & Prefetch (`prefetch = 10`)**:
   - Worker chỉ giới hạn nhận tối đa 10 lệnh cùng lúc để tránh quá tải RAM/DB pool (Backpressure).
   - Message chỉ bị xóa khỏi queue sau khi DB transaction đã **commit thành công**.
3. **Phân biệt Lỗi Nghiệp vụ vs Lỗi Hệ thống với Dead Letter Queue (`orders.dlx` $\rightarrow$ `orders.dlq`)**:
   - **Lỗi nghiệp vụ** (ví dụ: không đủ số dư `INSUFFICIENT_AVAILABLE_BALANCE`): Cập nhật lệnh sang `REJECTED` kèm `rejectReason`, phát event `order.rejected` và **ACK** message. *Tuyệt đối không đẩy lỗi nghiệp vụ vào DLQ hay retry vô hạn!*
   - **Lỗi hệ thống** (mất kết nối DB, deadlock bất ngờ): Rollback transaction và **NACK (`requeue: false`)** để RabbitMQ định tuyến message sang `orders.dlq` phục vụ kiểm tra/replay an toàn.
4. **Domain Events Exchange (`fintrade.events`, kiểu `topic`)**:
   - Worker sau khi commit transaction sẽ phát sự kiện `order.pending`, `order.rejected`, `order.cancelled` lên topic exchange, giúp Pha 5 (Matching Engine) và Pha 6 (Centrifugo) tiêu thụ độc lập mà không bị gắn chặt vào `OrderService`.

---

### ADR 15: Máy Trạng Thái Lệnh Bất Đồng Bộ & Market Data Stale Circuit Breaker

#### Vòng đời trạng thái lệnh (`OrderStatusEnum`):
```text
POST /api/orders ──> [QUEUED] ──(RabbitMQ Worker: AccountService.lockBalance)──> [PENDING]
                        │                                                             │
                        └──(Không đủ số dư)──> [REJECTED]                             ├──(DELETE /api/orders/:id)──> [CANCELLED] (unlockBalance)
                                                                                      └──(Pha 5 Matching Engine)───> [PARTIALLY_FILLED / FILLED]
```

#### Quy tắc bảo vệ tính nhất quán:
1. **Worker Idempotency Guard**: Trước khi gọi `lockBalance`, worker khóa dòng `Order` bằng `SELECT FOR UPDATE` và kiểm tra `order.status === QUEUED`. Nếu message bị RabbitMQ gửi lại do sự cố mạng sau khi worker đã xử lý xong, worker sẽ bỏ qua và ACK ngay $\rightarrow$ không bao giờ khóa tiền 2 lần!
2. **Market Data Stale Circuit Breaker**: Đối với lệnh `MARKET`, nếu chưa có tick từ Binance hoặc tick cuối cùng đã quá **5 giây** (`Date.now() - latestTick.timestamp > 5000`), hệ thống lập tức từ chối bằng lỗi `MARKET_DATA_STALE` để tránh khớp lệnh theo giá cũ gây thiệt hại cho người dùng.

---

## 6. Tối Ưu Hóa Hạ Tầng Streaming (Kafka & Data Plane ADRs)

### ADR 16: Phân Bổ Kafka Partition Theo Symbol (Dedicated Partition Mapping vs Murmur2 Hash Collision)

#### Bối cảnh:
Trong Pha 3, khi topic `market.ticks` được tạo với 3 partitions (0, 1, 2) cho 3 cặp giao dịch (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`), dữ liệu thực tế kiểm tra từ broker cho thấy sự bất đối xứng nghiêm trọng:
- `Partition 0`: 29,226 messages (chỉ chứa `SOLUSDT`)
- `Partition 1`: **0 messages** (hoàn toàn rỗng!)
- `Partition 2`: 280,925 messages (chứa cả `BTCUSDT` và `ETHUSDT`)

#### Phân tích nguyên nhân gốc rễ (Root Cause Analysis):
1. **Vị trí tính Partition**: Việc chọn partition diễn ra hoàn toàn ở **Kafka Producer (Client-side)** trước khi bắn qua mạng, broker không tham gia vào việc phân chia này.
2. **Thuật toán băm mặc định**: Khi chỉ truyền `key` mà không truyền `partition`, KafkaJS và Kafka Java Client dùng thuật toán Murmur2:
   $$\text{partition} = (\text{murmur2}(\text{key}) \ \& \ \text{0x7fffffff}) \pmod{\text{numPartitions}}$$
3. **Bản chất cam kết của Kafka**:
   - Kafka **chỉ cam kết**: *Tất cả các message có CÙNG KEY luôn rơi vào CÙNG 1 PARTITION* (để bảo toàn thứ tự FIFO theo key).
   - Kafka **tuyệt đối không cam kết**: *Các key KHÁC NHAU sẽ rơi vào các partition KHÁC NHAU*.
4. **Xác suất va chạm toán học (Birthday Paradox)**:
   - Với 3 key ngẫu nhiên và 3 partitions, xác suất để 3 key phân bổ hoàn hảo vào 3 partition riêng biệt chỉ là:
     $$P = \frac{3}{3} \times \frac{2}{3} \times \frac{1}{3} = \frac{2}{9} \approx 22.22\%$$
   - Xác suất xảy ra va chạm (Collision — có partition trống và có partition ôm nhiều coin) lên tới **$77.78\%$**!
   - Chạy hàm băm thực tế:
     - `murmur2("BTCUSDT") % 3 = 2`
     - `murmur2("ETHUSDT") % 3 = 2` $\rightarrow$ Va chạm trực tiếp!
     - `murmur2("SOLUSDT") % 3 = 0`
     - Dẫn tới Partition 1 có **0 messages**.

#### Tác hại trong Sàn Giao Dịch (FinTech Engine):
1. **Lệch tải (Load Skew)**: Worker phụ trách Partition 2 phải gánh gấp đôi tải lượng tick của 2 đồng coin biến động mạnh nhất (BTC và ETH).
2. **Lãng phí tài nguyên**: Worker phụ trách Partition 1 chạy không tải.
3. **Nghẽn dây chuyền (Head-of-Line Blocking)**: Khi luồng tick BTC bùng nổ (ví dụ 10,000 tick/s), worker Partition 2 bị chậm lại, kéo theo luồng tick ETH cũng bị trễ theo dù volume ETH lúc đó đang bình thường.

#### Quyết định: Áp dụng Dedicated Symbol-to-Partition Mapping
1. **Cơ chế ghi đè của Kafka**: Trong source code của KafkaJS (`legacy/partitioner.js`):
   ```javascript
   if (message.partition !== null && message.partition !== undefined) {
     return message.partition; // Bỏ qua hoàn toàn hàm băm Murmur2
   }
   ```
2. **Bảng ánh xạ tĩnh cố định**:
   ```typescript
   export const SYMBOL_PARTITIONS: Record<string, number> = {
     BTCUSDT: 0,
     ETHUSDT: 1,
     SOLUSDT: 2,
   };
   ```
3. **Cơ chế Fallback**: Với các cặp coin mới ngoài 3 coin cốt lõi, hàm `getPartitionForSymbol` sử dụng hàm băm DJB2 chia lấy dư theo `totalPartitions` để phân bổ đồng đều.
4. **Đồng bộ cả Tick và Candle**: Cả `sendTick(tick)` và `sendCandle(candle)` đều truyền trực tiếp `partition: getPartitionForSymbol(...)`.

#### Lợi ích đạt được:
- **Deterministic 100%**: Không phụ thuộc vào sự ngẫu nhiên của hàm băm Murmur2.
- **Worker Isolation (Cách ly theo đồng coin)**: Khi chạy Consumer Group 3 workers, mỗi worker phụ trách độc quyền 1 đồng coin duy nhất. Một đồng coin bị bão volume không bao giờ ảnh hưởng tới các đồng coin khác.
- **Tải phân bổ đều 100%**: Mỗi partition có đúng 1 stream dữ liệu tương ứng.

---

## 7. Pha 5: In-Memory Matching Engine & Trade Settlement (Matching ADRs)

### ADR 17: Kiến Trúc Sổ Lệnh In-Memory (Price-Time Priority & RAM State Recovery)

#### Bối cảnh:
Trong sàn giao dịch tài chính, việc khớp lệnh (Matching Engine) đòi hỏi độ trễ cực thấp (Sub-millisecond $< 1\text{ms}$). Nếu mỗi lệnh đến phải thực hiện truy vấn CSDL PostgreSQL (`SELECT ... ORDER BY price, created_at FOR UPDATE`) để tìm lệnh đối ứng, IOPS của CSDL sẽ bị nghẽn (Disk bottleneck) và hệ thống sẽ sập khi lưu lượng thị trường tăng cao.

#### Quyết định kiến trúc: Sổ Lệnh 100% Trong RAM (In-Memory Orderbook)
1. **Cấu trúc Dữ liệu Sổ Lệnh (`OrderBook`)**:
   - `bids` (Bên Mua): Mảng sắp xếp **giảm dần theo giá (Descending)**. Lệnh giá cao hơn được ưu tiên khớp trước.
   - `asks` (Bên Bán): Mảng sắp xếp **tăng dần theo giá (Ascending)**. Lệnh giá rẻ hơn được ưu tiên khớp trước.
   - **Quy tắc FIFO (First-In-First-Out)**: Nếu hai lệnh có cùng mức giá, lệnh nào được tạo sớm hơn (`createdAt` nhỏ hơn) sẽ đứng trước và được khớp trước (Price-Time Priority).
   - `orderMap`: Bảng băm $O(1)$ lưu `orderId -> OrderBookEntry` phục vụ tra cứu và hủy lệnh (`removeOrder`) tức thì.
2. **Khôi Phục Trạng Thái Bền Vững (RAM State Recovery)**:
   - Bộ nhớ RAM có tính chất dễ mất dữ liệu (volatile) khi restart tiến trình backend.
   - Để đảm bảo tính bền vững (Durability), khi `MatchingService` khởi động (`onModuleInit`), hàm `restoreRestingOrdersFromDb()` tự động truy vấn các lệnh `PENDING` và `PARTIALLY_FILLED` từ bảng `orders` của PostgreSQL và nạp lại vào RAM theo đúng thứ tự thời gian.
3. **Phân Rã L2 Orderbook Depth**:
   - Hàm `getDepth(limit = 20)` gom nhóm toàn bộ khối lượng các lệnh có cùng mức giá thành các `OrderBookLevel` (`price`, `quantity`, `orderCount`), phục vụ vẽ đồ thị độ sâu (Market Depth) và bắn ra Centrifugo.

---

### ADR 18: Khớp Lệnh Lai (P2P Internal Book + Simulated Binance Liquidity) & Hoàn Trả Ký Quỹ Thặng Dư

#### Bối cảnh:
Dự án là nền tảng Paper-Trading chạy trên dữ liệu thời gian thực của Binance. Sàn cần giải quyết 2 bài toán:
1. Cho phép người dùng và bot khớp lệnh chéo với nhau (P2P Internal Liquidity).
2. Khi sổ lệnh nội bộ chưa có lệnh đối ứng, người dùng vẫn phải khớp được lệnh Market hoặc Limit theo giá biến động thật của thế giới (Simulated Market Maker Liquidity).

#### Quyết định kiến trúc:
1. **Khớp Lệnh Thị Trường (Market Order)**:
   - Ưu tiên quét sạch các mức giá trong Sổ lệnh nội bộ trước (từ rẻ nhất lên đắt dần đối với BUY, hoặc từ đắt nhất xuống rẻ dần đối với SELL).
   - Nếu sổ lệnh nội bộ hết hàng (hoặc không đủ khối lượng), phần dư còn lại tự động khớp với giá thị trường mới nhất từ Binance (`CandleAggregatorService.getLatestPrice`).
2. **Khớp Lệnh Treo Theo Luồng Tick (Tick-Driven Matching)**:
   - Khi Binance đẩy tick mới qua WebSocket:
     - Lệnh BUY Limit treo giá $\ge P_{\text{tick}}$: Lập tức được kích hoạt khớp mua.
     - Lệnh SELL Limit treo giá $\le P_{\text{tick}}$: Lập tức được kích hoạt khớp bán.
3. **Cơ Chế Hoàn Trả Ký Quỹ Thặng Dư (Price Improvement Refund)**:
   - **Vấn đề**: User đặt lệnh BUY LIMIT tại giá 65,000 USDT (đã khóa 65,000 USDT), nhưng khi giá thị trường rớt xuống 64,000 USDT, lệnh khớp tại 64,000 USDT (khách hàng được lợi về giá 1,000 USDT).
   - **Giải pháp**:
     - `AccountService.settleTrade`: Chi đúng 64,000 USDT từ số dư ký quỹ (`LOCKED`) để nhận 1.0 BTC vào `AVAILABLE`.
     - `AccountService.unlockBalance`: Tự động hoàn trả 1,000 USDT thặng dư còn lại từ `LOCKED` về lại `AVAILABLE` của người dùng.
     - **Kết quả**: Số dư ký quỹ được dọn sạch về `0.00000000`, triệt tiêu 100% hiện tượng thất thoát/kẹt tiền (Zero Penny Leakage).
4. **Quyết toán Sổ Cái Kép Nguyên Tử (Atomic Double-Entry Settlement)**:
   - Mọi lượt khớp (P2P hoặc Simulated) sinh ra bản ghi `Trade` trong CSDL PostgreSQL.
   - Cấn trừ đồng thời 2 tài khoản (hoặc 1 tài khoản nếu simulated) trong Database Transaction với Row-Level Lock (`setLock('pessimistic_write')`).
   - Phát sự kiện miền `trade.executed` lên Topic Exchange `fintrade.events`.

---

## 8. Pha 6: Realtime Gateway với Centrifugo & Client Throttling (Realtime ADRs)

### ADR 19: Kiến Trúc Dedicated Realtime Gateway với Centrifugo v5

#### Bối cảnh:
Trong sàn giao dịch tài chính, bảng giá, nến đồ thị và sổ lệnh L2 cập nhật liên tục với tần số cao (hàng chục đến hàng trăm events/giây). Nếu triển khai WebSocket bằng `Socket.io` hoặc `@nestjs/websockets` trực tiếp trong tiến trình Node.js:
1. **Event Loop Starvation**: Node.js là đơn luồng (Single-Threaded). Việc duy trì hàng nghìn kết nối TCP/TLS, xử lý heartbeat ping/pong và serialization JSON để fan-out broadcast sẽ chiếm dụng Event Loop, làm tăng độ trễ (latency spikes) của Matching Engine và Order Processing.
2. **Khó Scale Độc Lập**: Mỗi khi scale horizontal WebSocket connections, ta phải scale toàn bộ backend nặng nề kèm DB connection pools.

#### Quyết định kiến trúc: Tách Biệt Realtime Gateway bằng Centrifugo v5 (Go)
1. **Dấu chân tài nguyên siêu nhẹ**:
   - Centrifugo được viết bằng Go, sử dụng mô hình Concurrency Go-routines hiệu năng cao.
   - Dung lượng bộ nhớ chỉ khoảng **~30MB RAM** trên máy chủ cá nhân, gánh hàng chục nghìn kết nối đồng thời dễ dàng.
2. **Giao tiếp Decoupled qua HTTP API**:
   - Backend NestJS không duy trì socket kết nối với client. NestJS chỉ đóng vai trò Publisher, bắn tin nhắn qua HTTP POST `/api/publish` hoặc `/api/broadcast` tới Centrifugo qua mạng nội bộ Docker (`http://localhost:8001/api`).
3. **Cấu Trúc Phân Tách Namespaces (`centrifugo.json`)**:
   - **Namespace `public`**: Kênh dữ liệu thị trường công khai không yêu cầu xác thực (`allow_subscribe_for_client: true`).
     - `public:ticks:<symbol>`: Luồng tick giá trực tiếp từ Binance.
     - `public:orderbook:<symbol>`: Độ sâu sổ lệnh L2 (Top 20 bids/asks).
     - `public:trades:<symbol>`: Băng chuyền các lệnh khớp công khai (Public Trades Tape).
     - `public:candles:<symbol>:<interval>`: Dữ liệu nến đóng/mở phục vụ TradingView Lightweight Charts.
   - **Namespace `personal`**: Kênh thông tin tài khoản riêng tư (`presence: false`).
     - `personal:<user_id>`: Nhận biến động lệnh cá nhân (`ORDER_UPDATE`) và kết quả khớp lệnh (`TRADE_EXECUTED`).
4. **Bảo Mật với HMAC-SHA256 JWT Tokens**:
   - `Connection Token`: Cấp cho client mở kết nối WebSocket an toàn tới Centrifugo.
   - `Subscription Token`: Kiểm soát quyền đăng ký kênh riêng tư `personal:<user_id>`, ngăn chặn người dùng xem trộm lệnh của người khác.

---

### ADR 20: Kiểm Soát Áp Lực Ngược Phía Client (Client-Side Backpressure) bằng Leading + Trailing Edge Orderbook Throttling

#### Bối cảnh:
Khi thị trường tài chính biến động mạnh (như khi tin tức ra hoặc giá biến động lớn), Binance WebSocket và Matching Engine có thể đẩy ra 50 đến 100 cập nhật sổ lệnh mỗi giây. Nếu phát toàn bộ 100 updates/giây này qua WebSocket tới trình duyệt của người dùng:
1. Trình duyệt Next.js/React sẽ bị nghẽn luồng DOM rendering (CPU 100%, giật lag, drop frame xuống dưới 10fps).
2. Lãng phí băng thông mạng vì mắt người chỉ có thể theo dõi biến động ở tần số tối đa 10-15 lần/giây.

#### Quyết định kiến trúc: Bộ Lọc Throttler (Leading + Trailing Edge) 100ms
1. **Thuật toán Coalescing Snapshot**:
   - Cửa sổ thời gian điều tiết: **100ms** (tương đương tối đa 10 updates/giây cho mỗi cặp coin).
   - **Leading Edge (Không độ trễ)**: Khi có biến động đầu tiên sau một khoảng im ắng, phát snapshot độ sâu sổ lệnh ngay lập tức ($0\text{ms}$ delay).
   - **Trailing Edge (Gộp dữ liệu)**: Mọi biến động dồn dập kế tiếp trong cửa sổ 100ms sẽ không bắn lẻ tẻ từng đợt, mà được gộp lại. Khi đồng hồ 100ms kết thúc, chỉ duy nhất 1 bản chụp sổ lệnh (L2 Depth Snapshot) mới nhất được phát đi.
2. **Phân Lập Theo Từng Cặp Coin (Symbol Isolation)**:
   - Throttler quản lý timer độc lập cho từng symbol (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`). Sự dồn dập của BTC hoàn toàn không làm trễ lịch cập nhật của ETH hay SOL.
3. **Hiệu Quả**:
   - Giảm tải **~85-90% lượng message truyền qua mạng** trong các đợt bão biến động giá.
   - Giao diện người dùng Next.js render mượt mà ở mức 60fps chuẩn xác.

---

## 9. Pha 7: Automated Trading Bot Engine (Trading Bot ADRs)

### ADR 21: Kiến Trúc Grid Trading Worker & Counterpart Rebalancing (Tự Động Tái Cân Bằng Lưới Đa Tầng)

#### Bối cảnh:
Trong thị trường Crypto hoặc ngoại hối, giá thường xuyên dao động đi ngang trong một biên độ nhất định (Sideway/Range-bound Market) chiếm đến 70% thời gian. Chiến lược **Grid Trading (Giao dịch lưới)** tận dụng đặc tính này bằng cách chia dải giá thành nhiều tầng đều nhau, đặt lệnh mua ở các mức giá thấp và bán ở các mức giá cao để thu về lợi nhuận vi mô (Micro-profits) liên tục từ biến động thị trường.
Thách thức kỹ thuật đặt ra:
1. **Quản lý trạng thái đa tầng (Multi-level State Tracking)**: Khi rải 5-20 mức giá, làm thế nào để theo dõi lệnh nào thuộc tầng nào, lệnh nào đã khớp, và lệnh đối ứng tương ứng là gì?
2. **Tự động tái cân bằng (Automatic Counterpart Order Rebalancing)**: Khi một lệnh BUY khớp, hệ thống phải tự động sinh lệnh SELL chốt lời ở tầng trên liền kề; khi lệnh SELL khớp, phải đặt lại lệnh BUY ở tầng dưới để tiếp tục chu kỳ.
3. **Độ chính xác tài chính**: Toàn bộ tính toán khoảng cách lưới (Grid Step), số lượng coin trên mỗi tầng, giá đặt lệnh và PnL thực nhận (`realizedPnl`) phải tuyệt đối chính xác, không được sai lệch số thập phân.

#### Quyết định kiến trúc:
1. **Tính toán Lưới Số Học Chuẩn (Arithmetic Grid Calculation)**:
   - Khoảng cách giữa các tầng lưới:
     $$\text{step} = \frac{\text{upperBound} - \text{lowerBound}}{\text{gridLevels} - 1}$$
   - Mức giá tầng thứ $i$ ($0 \le i < \text{gridLevels}$):
     $$P_i = \text{lowerBound} + i \times \text{step}$$
   - Khối lượng trên mỗi tầng:
     $$Q_i = \frac{\text{investmentAmount}}{\text{gridLevels} \times P_i}$$
   - Toàn bộ tính toán được thực hiện bằng `bignumber.js` và làm tròn chuẩn 8 chữ số thập phân (`toFixed(8)`).
2. **Khởi tạo Lưới Dựa Trên Giá Thị Trường (Market-Aware Initial Placement)**:
   - Lấy giá thị trường hiện tại $P_{\text{current}}$ từ `MarketKafkaService` hoặc `CandleAggregatorService`.
   - Với mọi tầng $i$ có $P_i < P_{\text{current}}$: Đặt lệnh `LIMIT BUY` với giá $P_i$.
   - Các tầng có $P_i \ge P_{\text{current}}$: Để trống, sẵn sàng làm tầng chốt lời khi các lệnh BUY bên dưới khớp.
3. **Cơ Chế Khớp & Sinh Lệnh Đối Ứng (Counterpart Execution Loop)**:
   - Worker lắng nghe sự kiện `trade.executed` từ `MatchingService` thông qua EventEmitter hoặc RabbitMQ.
   - Khi phát hiện một lệnh của bot được khớp:
     - **Nếu lệnh BUY ở tầng $i$ khớp**:
       - Tầng $i$ chuyển trạng thái thành `FILLED`.
       - Ngay lập tức đặt một lệnh `LIMIT SELL` đối ứng ở tầng $i+1$ với giá $P_{i+1}$ và khối lượng $Q_i$.
       - Lợi nhuận dự kiến khóa được: $\Delta P \times Q_i = (P_{i+1} - P_i) \times Q_i$.
     - **Nếu lệnh SELL ở tầng $j$ khớp**:
       - Tầng $j$ chuyển trạng thái thành `FILLED`.
       - Đặt lại lệnh `LIMIT BUY` ở tầng $j-1$ với giá $P_{j-1}$ để duy trì lưới liên tục.
       - Cộng dồn lợi nhuận thực tế:
         $$\text{profit} = (P_j - P_{j-1}) \times Q_{j-1}$$
         $$\text{realizedPnl} \leftarrow \text{realizedPnl} + \text{profit}$$
       - Tăng biến đếm `totalTrades` và cập nhật bản ghi `BotConfig` trong cơ sở dữ liệu.
4. **Idempotency & Khôi phục Sau Sự Cố (Crash Recovery)**:
   - Mỗi lệnh sinh ra từ bot mang `Idempotency-Key` có định dạng duy nhất: `bot_<botId>_grid_<levelIndex>_<orderSide>_<timestamp>`.
   - Khi tiến trình NestJS khởi động lại (`onApplicationBootstrap`), `BotService.restoreActiveBots()` quét tất cả các bot có trạng thái `is_active = true` trong database và tự động tái lập các worker tương ứng.

---

### ADR 22: Chiến Lược Tín Hiệu Alpha EMA Cross (9/21) Trên Nến Đóng (Closed Candle Evaluation)

#### Bối cảnh:
Chiến lược giao dịch theo xu hướng (Trend Following) dựa trên giao cắt đường trung bình động hàm mũ (Exponential Moving Average - EMA) là một trong những thuật toán cơ bản và phổ biến nhất trong giao dịch định lượng:
- **EMA Ngắn Hạn (EMA 9)**: Phản ứng nhanh với biến động giá gần nhất.
- **EMA Dài Hạn (EMA 21)**: Thể hiện xu hướng chủ đạo trung hạn của thị trường.
- **Tín hiệu**:
  - **Golden Cross (Giao cắt vàng)**: EMA 9 cắt vượt lên trên EMA 21 $\rightarrow$ Xu hướng tăng giá (Bullish) $\rightarrow$ Đặt lệnh Mua (BUY).
  - **Death Cross (Giao cắt tử thần)**: EMA 9 cắt rơi xuống dưới EMA 21 $\rightarrow$ Xu hướng giảm giá (Bearish) $\rightarrow$ Đặt lệnh Bán (SELL).

Tuy nhiên, trong môi trường streaming tần số cao với hàng trăm tick giá/giây:
- **Vấn đề Whipsaw (Bẫy Tín Hiệu Giả Trong Phiên)**: Khi một cây nến chưa đóng, giá dao động giật lên giật xuống liên tục. Nếu bot đánh giá EMA trên từng tick, nó sẽ phát tín hiệu mua/bán hàng chục lần trong vòng 1 phút, dẫn đến việc liên tục mở và đóng vị thế ở mức giá xấu, chịu phí giao dịch khổng lồ và bào mòn toàn bộ vốn.

#### Quyết định kiến trúc:
1. **Chỉ Đánh Giá Tín Hiệu Trên Cây Nến Đã Đóng (`isClosed === true`)**:
   - `EmaCrossWorker` đăng ký lắng nghe sự kiện `onCandle` từ `CandleAggregatorService`.
   - Bỏ qua mọi cập nhật nến trung gian (`isClosed === false`).
   - Chỉ khi nến 1 phút chính thức hoàn tất và đóng nến, giá đóng cửa (`closePrice`) mới được chốt để đưa vào mảng dữ liệu tính toán chỉ báo.
   - **Lợi ích**: Loại trừ 100% hiện tượng Whipsaw trong phiên, đảm bảo tín hiệu giao dịch có tính ổn định và xác nhận cao.
2. **Thuật Toán Tính EMA Thuần Túy Bằng `BigNumber.js`**:
   - Hệ số nhân trọng số (Multiplier):
     $$\alpha = \frac{2}{N + 1}$$
     Với $N = 9 \rightarrow \alpha_9 = \frac{2}{10} = 0.2$. Với $N = 21 \rightarrow \alpha_{21} = \frac{2}{22} \approx 0.09090909$.
   - Công thức đệ quy:
     $$\text{EMA}_t = (P_{\text{close}} - \text{EMA}_{t-1}) \times \alpha + \text{EMA}_{t-1}$$
   - Mọi phép nhân, chia, cộng, trừ thực hiện bằng `BigNumber.js`, giá trị khởi tạo ban đầu $\text{EMA}_0$ lấy từ trung bình cộng đơn giản (SMA) của $N$ nến đầu tiên.
3. **Phát Hiện Điểm Giao Cắt Liên Tiếp (State-Aware Cross Detection)**:
   - Để xác định chính xác thời điểm giao cắt (Cross Moment), thuật toán so sánh vị thế của 2 nến gần nhất:
     - **Golden Cross**: $\text{EMA}_{9, \text{prev}} \le \text{EMA}_{21, \text{prev}}$ VÀ $\text{EMA}_{9, \text{curr}} > \text{EMA}_{21, \text{curr}}$.
     - **Death Cross**: $\text{EMA}_{9, \text{prev}} \ge \text{EMA}_{21, \text{prev}}$ VÀ $\text{EMA}_{9, \text{curr}} < \text{EMA}_{21, \text{curr}}$.
   - Kết hợp biến trạng thái `lastSignal` (`BUY` | `SELL` | `NONE`):
     - Nếu tín hiệu mới trùng với `lastSignal`, worker sẽ bỏ qua không đặt lệnh lặp lại (Signal Debouncing / Cooldown).
4. **Thực Thi Lệnh Thị Trường Tin Cậy (Market Order Execution)**:
   - Khi có tín hiệu hợp lệ, worker sinh lệnh `MARKET BUY` hoặc `MARKET SELL` qua `OrderService.createOrder`.
   - Lệnh được đưa vào RabbitMQ `orders.queue` với cờ idempotency tự sinh, đảm bảo không bao giờ bị nghẽn thread xử lý của event loop.







