def build_signal_payload(
    strategy_code: str,
    candle: dict,
    action: int,
    generated_at_ms: int,
) -> dict:
    """
    Hợp đồng JSON đẩy sang RabbitMQ queue `trading.signals`.
    signalId xác định trước theo (strategyCode, symbol, interval, candleOpenTime)
    để NestJS dùng làm Idempotency-Key chống đặt lệnh trùng tuyệt đối.
    """
    symbol = str(candle["symbol"]).upper()
    interval = str(candle["interval"])
    open_time = int(candle["openTime"])
    close_time = int(candle["closeTime"])

    return {
        "signalId": f"{strategy_code}:{symbol}:{interval}:{open_time}",
        "strategyCode": strategy_code,
        "symbol": symbol,
        "interval": interval,
        "candleOpenTime": open_time,
        "candleCloseTime": close_time,
        "action": action,
        "refPrice": str(candle["close"]),
        "generatedAt": generated_at_ms,
    }
