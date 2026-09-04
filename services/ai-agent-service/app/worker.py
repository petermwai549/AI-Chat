# services/ai-agent-service/app/worker.py
#
# Standalone consumer process. Runs as its own container (see
# docker-compose.yml: ai-agent-worker), separate from the FastAPI process,
# so a slow or failed title generation never blocks a chat request.
#
# Run manually with: python -m app.worker

import asyncio
import json
import aio_pika
from ollama import AsyncClient
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal
from app.rabbitmq_client import amqp_url, TITLE_QUEUE, DLX_EXCHANGE, DLQ_QUEUE

TITLE_PROMPT = (
    "Generate a short, plain title (3-6 words, no quotes, no trailing "
    "punctuation) that summarizes what this conversation is about, "
    "based on the opening message below.\n\nMessage: {prompt}\n\nTitle:"
)

async def generate_title(prompt: str) -> str:
    headers = {}
    if settings.OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"
    client = AsyncClient(host=settings.OLLAMA_HOST, headers=headers)
    response = await client.chat(
        model="gpt-oss:20b-cloud",
        messages=[{"role": "user", "content": TITLE_PROMPT.format(prompt=prompt[:500])}],
        stream=False,
    )
    title = response["message"]["content"].strip().strip('"').strip("'")
    return title[:80] or "New chat"

async def handle_message(message: aio_pika.IncomingMessage):
    # message.process() acks on success automatically, and on an uncaught
    # exception nacks WITHOUT requeue — which routes it to the dead-letter
    # exchange (since the queue was declared with x-dead-letter-exchange)
    # instead of looping forever on a poison message.
    async with message.process(requeue=False):
        data = json.loads(message.body)
        chat_id = data["chat_id"]
        prompt = data["prompt"]

        title = await generate_title(prompt)

        async with AsyncSessionLocal() as db:
            await db.execute(
                text("UPDATE chats SET title = :title WHERE id = :id"),
                {"title": title, "id": chat_id}
            )
            await db.commit()

        print(f"Title generated for chat {chat_id}: {title}")

async def main():
    print("Starting chat-title-generation worker...")
    connection = await aio_pika.connect_robust(amqp_url())
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=5)

    dlx = await channel.declare_exchange(DLX_EXCHANGE, aio_pika.ExchangeType.FANOUT, durable=True)
    dlq = await channel.declare_queue(DLQ_QUEUE, durable=True)
    await dlq.bind(dlx)

    queue = await channel.declare_queue(
        TITLE_QUEUE,
        durable=True,
        arguments={"x-dead-letter-exchange": DLX_EXCHANGE},
    )

    print(f"Listening on '{TITLE_QUEUE}'...")
    await queue.consume(handle_message)

    try:
        await asyncio.Future()  # run forever
    finally:
        await connection.close()

if __name__ == "__main__":
    asyncio.run(main())