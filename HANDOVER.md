# 📋 Báo Cáo Bàn Giao & Trạng Thái Dự Án (Project Handover)
## FinTrade Backend: High-Throughput Algorithmic Trading & Paper-Trading Engine

> **Ngày cập nhật**: 25/11/2026  
> **Trạng thái tổng thể**: Đã hoàn thành **Pha 1 → Pha 7 (Kiến trúc Tách Biệt Quant Plane Python + Execution Plane NestJS + Kho Nến Đa Khung 3 Tầng)** và toàn bộ tài liệu kỹ thuật (**24 ADRs**). Biên dịch sạch (`nest build: 0 error`), **88/88 Jest tests PASS** (16 suites) + **4/4 Python `quant-worker` unit tests PASS**. Sẵn sàng chạy migration & kiểm thử live hoặc chuyển sang **Pha 8 (Containerize, K3s & Metrics)**.

---

## 1. Trạng Thái Hiện Tại (Current Status)

| Thành phần | Trạng thái | Chi tiết |
| :--- | :--- | :--- |
| **Hạ tầng Docker** | ✅ Cấu hình xong | Postgres 15, Redis 7, RabbitMQ 3.13, Kafka 3.7 (KRaft), Centrifugo v5 |
| **Pha 1: Core Setup** | ✅ Hoàn tất | Config environment type-safe (kèm `BINANCE_KLINE_INTERVALS`, `KLINE_WARMUP_BARS=1000`), Centrifugo config |
| **Pha 2: Sổ Cái Kép (Ledger)** | ✅ Hoàn tất | Entities `Account` & `LedgerEntry`, Pessimistic Lock, Faucet, Audit tự động (8/8 tests pass) |
| **Pha 3: Market Data & Multi-TF Klines** | ✅ Nâng cấp hoàn tất | Binance WS `@trade` (1s UI) + `@kline_1m/5m/15m/1h/1d`, REST `/api/v3/klines` warm-up 1000 bar & vá lỗ hổng sau reconnect, lưu trữ 3 tầng (Postgres `market_candle` + RAM 1000 nến + Kafka `market.candles`) |
| **Pha 4: Order & RabbitMQ** | ✅ Hoàn tất | Entity `Order`, Redis + DB Idempotency 2 tầng, RabbitMQ (`orders.queue`, `orders.dlq`, `trading.signals`, `trading.signals.dlq`) |
| **Pha 5: Matching Engine** | ✅ Hoàn tất | In-Memory Orderbook (Price-Time Priority), Khớp lệnh lai (P2P + Simulated Binance Liquidity), Hoàn trả ký quỹ thặng dư, Quyết toán sổ cái kép |
| **Pha 6: Centrifugo Gateway** | ✅ Hoàn tất | Dedicated WebSocket Gateway, HMAC-SHA256 JWT auth, Leading + Trailing Edge 100ms Depth Throttling |
| **Pha 7: Trading Bot & Quant Worker** | ✅ Làm lại theo Phương án A | Giữ `GridTradingWorker`; **hủy bỏ** bộ chỉ báo TS cũ (`ema.ts`, `ema-cross.worker.ts`); thêm `BotTypeEnum.ALPHA_SIGNAL` + `SignalConsumerService` (RabbitMQ `trading.signals`) + thư mục `quant-worker/` Python TA-Lib chạy hoàn toàn độc lập |
| **Pha 8: K3s Deployment** | ⏳ **Sẵn sàng triển khai** | Dockerfile multi-stage, K3s manifests, Prometheus & Grafana Metrics, tối ưu RAM $\le$ 8GB |

---

## 2. Chi Tiết Thay Đổi Pha 7 (Phương Án A: Multi-Timeframe + Python Quant Worker)

### 2.1. Pipeline Nến Đa Khung Thời Gian Chuẩn Binance (3 Tầng)
- [x] Entity `MarketCandle` (`src/entities/market-candle.entity.ts`) + Migration `1750000000000-create-market-candle-and-alpha-bot.ts`: bảng `market_candle` khóa chính kép `(symbol, interval, open_time)`, OHLCV `numeric(28, 8)`; đổi enum `EMA_CROSS` $\rightarrow$ `ALPHA_SIGNAL`.
- [x] `CandleStoreService` (`src/api/market/candle-store.service.ts`): RAM Ring Buffer 1000 nến chốt/symbol/interval (~5MB) + Postgres upsert idempotent; chỉ chấp nhận `isClosed = true`.
- [x] `BinanceRestService` (`src/api/market/binance-rest.service.ts`): Gọi `GET /api/v3/klines` với phân trang tự động, theo dõi `X-MBX-USED-WEIGHT-1M`, tự lùi (backoff) khi gặp HTTP 429/418, loại bỏ nến chưa đóng.
- [x] `KlineBackfillService` (`src/api/market/kline-backfill.service.ts`): Warm-up 1000 nến khi khởi động + tự động vá lỗ hổng khi WS reconnect.
- [x] `CandleAggregatorService` & `BinanceIngestionService`: Chỉ tự gom `1s` từ `@trade` cho UI; 5 khung `1m, 5m, 15m, 1h, 1d` lấy trực tiếp từ Binance `@kline_<interval>`. Khi `k.x === true`, đẩy Kafka `market.candles` ngay lập tức, lưu DB song song và đo độ trễ `receivedAt - k.T`.
- [x] `MarketController`: Bổ sung `GET /api/market/klines?symbol&interval&limit&endTime` (chỉ nến chốt cho `quant-worker` warm-up) và nâng cấp `GET /api/market/pipeline-status`.

### 2.2. Bot Execution Engine (NestJS) & Python Quant Worker Độc Lập
- [x] **Đã hủy bỏ**: `src/api/bot/indicators/ema.ts`, `ema.spec.ts`, `src/api/bot/workers/ema-cross.worker.ts`, endpoint `GET /api/bots/:id/indicators`.
- [x] **Giữ lại**: `GridTradingWorker` (`GRID_TRADING`).
- [x] `OrderRabbitmqService`: Khai báo thêm durable queue `trading.signals` + DLX `signals.dlx` / DLQ `trading.signals.dlq` và `registerSignalConsumer()`.
- [x] `SignalConsumerService` (`src/api/bot/signal-consumer.service.ts`):
  - Tiếp nhận `TradingSignalPayload` từ RabbitMQ (`action: 1 | -1 | 0`).
  - Idempotency-Key xác định trước: `sig-${botId}-${sha256(signalId).slice(0, 24)}` ($\le 64$ ký tự).
  - Chặn tín hiệu cũ (`maxStalenessMs` mặc định 15s cho `1m`, 30s cho `5m`, ...), chặn lặp cùng chiều, cô lập lỗi thiếu số dư theo từng bot.
  - Endpoint giám sát mới: `GET /api/bots/signals/status`.
- [x] Thư mục độc lập `quant-worker/` (Python):
  - `config.py`, `candle_buffer.py`, `signal_contract.py`, `signal_publisher.py`, `main.py`, `strategies/alpha_confluence.py` (chạy nguyên vẹn TA-Lib EMA 20/100, HMA 14, MACD 12/26/9, RSI, Volume SMA 20, ATR 14), `requirements.txt`, `.env.example`, `README.md`, `tests/test_alpha_worker.py`.
- [x] Tài liệu ADR: Bổ sung **ADR 23** và **ADR 24** vào `docs/ENGINEERING_LOG.md` & `ENGINEERING_LOG.md`.

---

## 3. Lệnh Chạy & Kiểm Thử

```bash
# 1. Khởi động hạ tầng Docker (Postgres, Redis, RabbitMQ, Kafka, Centrifugo)
docker-compose -f docker-compose-dev.yml up -d

# 2. Build & chạy migration mới (tạo bảng market_candle + đổi enum ALPHA_SIGNAL)
npm.cmd run build
npm.cmd run migration

# 3. Chạy toàn bộ Unit Tests NestJS (88/88 PASS - 16 test suites)
npm.cmd run test

# 4. Chạy Unit Tests Python quant-worker (4/4 PASS)
python -m unittest discover -s quant-worker/tests -v

# 5. Chạy NestJS dev server
npm.cmd run start:dev
# Swagger UI: http://localhost:8000/api-docs
# Kiểm tra warm-up nến 5m: GET http://localhost:8000/api/market/klines?symbol=BTCUSDT&interval=5m&limit=1000

# 6. Chạy Python quant-worker độc lập (terminal riêng)
cd quant-worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python main.py
```

---

## 4. Bước Tiếp Theo: **Pha 8 - Containerize, Kubernetes (K3s) & Metrics**
1. Multi-stage `Dockerfile` cho cả NestJS và `quant-worker`.
2. K3s manifests (`Deployment`, `Service`, `ConfigMap`, `Secret`, `HPA`) tối ưu $\le 8\text{GB RAM}$.
3. Health checks (`/health/liveness`, `/health/readiness`) & Graceful Shutdown.
4. Prometheus & Grafana Metrics (TPS, Matching Latency, Kline/Signal E2E Latency, RabbitMQ queue depth).
