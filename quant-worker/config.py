import os
from dataclasses import dataclass
from typing import List

from dotenv import load_dotenv

load_dotenv()


def _split_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class WorkerConfig:
    fintrade_api_url: str
    kafka_brokers: List[str]
    kafka_topic_candles: str
    kafka_group_id: str
    rabbitmq_uri: str
    rabbitmq_signal_queue: str
    rabbitmq_signal_dlx: str
    rabbitmq_signal_dlq: str
    symbols: List[str]
    intervals: List[str]
    warmup_bars: int
    alpha_rsi_period: int

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        return cls(
            fintrade_api_url=os.getenv("FINTRADE_API_URL", "http://localhost:8000").rstrip("/"),
            kafka_brokers=_split_csv(os.getenv("KAFKA_BROKERS", "localhost:9092")),
            kafka_topic_candles=os.getenv("KAFKA_TOPIC_CANDLES", "market.candles"),
            kafka_group_id=os.getenv("KAFKA_GROUP_ID", "fintrade-quant-worker"),
            rabbitmq_uri=os.getenv("RABBITMQ_URI", "amqp://guest:guest@localhost:5672"),
            rabbitmq_signal_queue=os.getenv("RABBITMQ_SIGNAL_QUEUE", "trading.signals"),
            rabbitmq_signal_dlx=os.getenv("RABBITMQ_SIGNAL_DLX", "signals.dlx"),
            rabbitmq_signal_dlq=os.getenv("RABBITMQ_SIGNAL_DLQ", "trading.signals.dlq"),
            symbols=[s.upper() for s in _split_csv(os.getenv("SYMBOLS", "BTCUSDT,ETHUSDT,SOLUSDT"))],
            intervals=_split_csv(os.getenv("INTERVALS", "1m,5m,15m,1h,1d")),
            warmup_bars=int(os.getenv("WARMUP_BARS", "1000")),
            alpha_rsi_period=int(os.getenv("ALPHA_RSI_PERIOD", "14")),
        )
