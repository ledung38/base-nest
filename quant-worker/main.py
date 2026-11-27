import json
import logging
import signal
import sys
import time
from typing import List

import requests
from kafka import KafkaConsumer

from candle_buffer import CandleBuffer
from config import WorkerConfig
from signal_contract import build_signal_payload
from signal_publisher import RabbitMqSignalPublisher
from strategies import AlphaConfluenceStrategy, AlphaStrategy

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("quant-worker")


def warmup_from_fintrade(
    config: WorkerConfig,
    buffer: CandleBuffer,
) -> None:
    session = requests.Session()
    for symbol in config.symbols:
        for interval in config.intervals:
            url = f"{config.fintrade_api_url}/api/market/klines"
            params = {
                "symbol": symbol,
                "interval": interval,
                "limit": config.warmup_bars,
            }
            try:
                resp = session.get(url, params=params, timeout=15)
                resp.raise_for_status()
                body = resp.json()
                candles = body["data"] if isinstance(body, dict) and "data" in body else body
                loaded = buffer.load_initial(symbol, interval, candles)
                logger.info(
                    "Warm-up loaded %d closed candles for %s %s",
                    loaded,
                    symbol,
                    interval,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Warm-up failed for %s %s from %s: %s",
                    symbol,
                    interval,
                    url,
                    exc,
                )


def run() -> None:
    config = WorkerConfig.from_env()
    buffer = CandleBuffer(max_size=config.warmup_bars)
    strategies: List[AlphaStrategy] = [
        AlphaConfluenceStrategy(rsi_period=config.alpha_rsi_period),
    ]

    logger.info(
        "Starting FinTrade Quant Worker | symbols=%s | intervals=%s | strategies=%s",
        config.symbols,
        config.intervals,
        [s.strategy_code for s in strategies],
    )

    # 1. Warm-up 1000 nến chốt từ NestJS API
    warmup_from_fintrade(config, buffer)

    # 2. Kết nối RabbitMQ publisher
    publisher = RabbitMqSignalPublisher(config)
    publisher.connect()

    # 3. Kết nối Kafka consumer đọc nến chốt từ topic market.candles
    consumer = KafkaConsumer(
        config.kafka_topic_candles,
        bootstrap_servers=config.kafka_brokers,
        group_id=config.kafka_group_id,
        auto_offset_reset="latest",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )

    watched_symbols = set(config.symbols)
    watched_intervals = set(config.intervals)

    running = True

    def _handle_shutdown(_signum, _frame):
        nonlocal running
        logger.info("Shutdown signal received, closing worker cleanly...")
        running = False

    signal.signal(signal.SIGINT, _handle_shutdown)
    signal.signal(signal.SIGTERM, _handle_shutdown)

    logger.info(
        "Listening for closed candles on Kafka topic [%s]...",
        config.kafka_topic_candles,
    )

    try:
        while running:
            records = consumer.poll(timeout_ms=1000)
            for _tp, messages in records.items():
                for msg in messages:
                    candle = msg.value
                    if not isinstance(candle, dict) or not candle.get("isClosed", False):
                        continue

                    symbol = str(candle.get("symbol", "")).upper()
                    interval = str(candle.get("interval", ""))
                    if symbol not in watched_symbols or interval not in watched_intervals:
                        continue

                    is_new = buffer.append_closed(candle)
                    if not is_new:
                        continue

                    ohlcv = buffer.to_numpy(symbol, interval)
                    if ohlcv is None:
                        continue

                    for strategy in strategies:
                        eval_start = time.perf_counter()
                        action = strategy.evaluate(ohlcv)
                        eval_ms = (time.perf_counter() - eval_start) * 1000.0

                        if action in (1, -1):
                            now_ms = int(time.time() * 1000)
                            payload = build_signal_payload(
                                strategy.strategy_code,
                                candle,
                                action,
                                now_ms,
                            )
                            publisher.publish(payload)
                            total_latency = now_ms - int(candle["closeTime"])
                            logger.info(
                                "[SignalPublished] %s action=%+d price=%s eval=%.2fms e2eFromClose=%dms",
                                payload["signalId"],
                                action,
                                payload["refPrice"],
                                eval_ms,
                                total_latency,
                            )
    finally:
        consumer.close()
        publisher.close()
        logger.info("Quant worker stopped cleanly.")


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        sys.exit(0)
