import aio_pika
import json
from app.config import settings

_connection = None
_channel = None

TITLE_QUEUE = "chat.title_generation"
DLX_EXCHANGE = "chat.dlx"
DLQ_QUEUE = "chat.title_generation.dlq"

def amqp_url() -> str:
    return f"amqp://{settings.RABBITMQ_USER}:{settings.RABBITMQ_PASSWORD}@{settings.RABBITMQ_HOST}/"

async def init_rabbitmq():
    """Set up the producer-side connection, channel, and durable topology."""
    global _connection, _channel
    _connection = await aio_pika.connect_robust(amqp_url())
    _channel = await _connection.channel()

    # Dead-letter exchange/queue: messages that repeatedly fail processing
    # land here instead of being lost or looping forever.
    dlx = await _channel.declare_exchange(DLX_EXCHANGE, aio_pika.ExchangeType.FANOUT, durable=True)
    dlq = await _channel.declare_queue(DLQ_QUEUE, durable=True)
    await dlq.bind(dlx)

    await _channel.declare_queue(
        TITLE_QUEUE,
        durable=True,
        arguments={"x-dead-letter-exchange": DLX_EXCHANGE},
    )

async def close_rabbitmq():
    if _connection:
        await _connection.close()

async def publish_chat_title_job(chat_id: str, prompt: str):
    """
    Fire-and-forget: queue a background job to generate a proper chat title.
    If RabbitMQ is unreachable, this fails open — the chat keeps its
    placeholder (truncated-prompt) title rather than blocking the response.
    """
    if _channel is None:
        print("⚠️ RabbitMQ channel not initialized — skipping title generation job")
        return
    try:
        payload = json.dumps({"chat_id": chat_id, "prompt": prompt}).encode()
        await _channel.default_exchange.publish(
            aio_pika.Message(
                body=payload,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=TITLE_QUEUE,
        )
    except Exception as e:
        print(f"⚠️ Failed to publish title generation job: {e}")