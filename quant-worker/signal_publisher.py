import json
import logging
from typing import Optional

import pika

from config import WorkerConfig

logger = logging.getLogger(__name__)


class RabbitMqSignalPublisher:
    """
    Publisher đẩy Alpha Signal vào RabbitMQ queue `trading.signals` (durable + DLQ + persistent).
    Khai báo topology khớp 1:1 với OrderRabbitmqService của NestJS.
    """

    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self._connection: Optional[pika.BlockingConnection] = None
        self._channel: Optional[pika.adapters.blocking_connection.BlockingChannel] = None

    def connect(self) -> None:
        params = pika.URLParameters(self.config.rabbitmq_uri)
        params.heartbeat = 30
        self._connection = pika.BlockingConnection(params)
        self._channel = self._connection.channel()

        # Topology khớp 100% với NestJS OrderRabbitmqService
        self._channel.exchange_declare(
            exchange=self.config.rabbitmq_signal_dlx,
            exchange_type="direct",
            durable=True,
        )
        self._channel.queue_declare(
            queue=self.config.rabbitmq_signal_dlq,
            durable=True,
        )
        self._channel.queue_bind(
            queue=self.config.rabbitmq_signal_dlq,
            exchange=self.config.rabbitmq_signal_dlx,
            routing_key=self.config.rabbitmq_signal_dlq,
        )
        self._channel.queue_declare(
            queue=self.config.rabbitmq_signal_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self.config.rabbitmq_signal_dlx,
                "x-dead-letter-routing-key": self.config.rabbitmq_signal_dlq,
            },
        )
        self._channel.confirm_delivery()
        logger.info(
            "RabbitMQ signal publisher ready on queue=[%s]",
            self.config.rabbitmq_signal_queue,
        )

    def publish(self, signal_payload: dict) -> None:
        if self._channel is None or self._channel.is_closed:
            self.connect()

        body = json.dumps(signal_payload).encode("utf-8")
        try:
            self._channel.basic_publish(
                exchange="",
                routing_key=self.config.rabbitmq_signal_queue,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,  # persistent
                    content_type="application/json",
                    message_id=signal_payload["signalId"],
                ),
                mandatory=True,
            )
        except (pika.exceptions.AMQPError, OSError):
            logger.warning("RabbitMQ publish failed, reconnecting and retrying once...")
            self.connect()
            self._channel.basic_publish(
                exchange="",
                routing_key=self.config.rabbitmq_signal_queue,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type="application/json",
                    message_id=signal_payload["signalId"],
                ),
                mandatory=True,
            )

    def close(self) -> None:
        if self._connection and not self._connection.is_closed:
            self._connection.close()
