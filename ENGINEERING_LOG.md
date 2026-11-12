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

