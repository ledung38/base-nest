# FinTrade Quant Worker (Độc lập)

Service Python **chạy hoàn toàn độc lập** với mã nguồn NestJS — có thể chạy trực tiếp tại thư mục này, đóng gói Docker riêng, hoặc copy nguyên sang repo backtest của bạn.

## Kiến trúc giao tiếp (Contract)

1. **Warm-up lịch sử (HTTP REST)**:
   - Gọi `GET ${FINTRADE_API_URL}/api/market/klines?symbol=BTCUSDT&interval=5m&limit=1000`
   - Nhận tối đa 1000 nến **đã chốt** (`isClosed = true`), nạp vào `CandleBuffer` (đủ để `EMA(100)` hội tụ với sai số `~2.5e-9` so với backtest).
2. **Nến chốt thời gian thực (Apache Kafka)**:
   - Subscribe topic `market.candles`.
   - Khi nhận nến chốt (`isClosed = true`) khớp `(symbol, interval)` đang theo dõi, nối vào mảng trượt `np.float64` (dedupe theo `openTime`) và gọi trực tiếp hàm chiến lược TA-Lib.
3. **Phát tín hiệu (RabbitMQ)**:
   - Chỉ khi chiến lược trả về `1` (BUY) hoặc `-1` (SELL), publish message persistent vào durable queue `trading.signals` (kèm DLX `signals.dlx` / DLQ `trading.signals.dlq`).
   - `signalId = "{strategyCode}:{symbol}:{interval}:{candleOpenTime}"` xác định trước để NestJS chống đặt lệnh trùng tuyệt đối.
   - Python **chỉ quyết định hướng giao dịch (`1` / `-1` / `0`)**; khối lượng, kiểm tra số dư, khóa tiền và Sổ cái kép do NestJS đảm nhiệm.

## Cài đặt & Chạy độc lập

```bash
cd quant-worker
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
python main.py
```

> **Lưu ý cài TA-Lib trên Windows**: Nếu `pip install TA-Lib` yêu cầu biên dịch C, cài bản wheel dựng sẵn (hoặc dùng `conda install -c conda-forge ta-lib`) cho đúng phiên bản Python của bạn.

## Chạy Unit Tests (không cần Broker)

```bash
python -m unittest discover -s tests -v
```

## Tích hợp vào Repo Backtest riêng của bạn

Bạn chỉ cần copy thư mục `quant-worker/` sang repo backtest, sau đó trong `strategies/` import trực tiếp hàm tín hiệu backtest có sẵn của bạn (nhận mảng `close, high, low, volume` kiểu `np.float64`, trả về `1 | -1 | 0`) và đăng ký vào `STRATEGIES` trong `main.py`.
