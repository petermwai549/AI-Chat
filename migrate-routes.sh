#!/bin/sh
set -e
ADMIN_KEY="fa2f8f80a08b5ec0406c57b621b8336d"
RUN="docker run --rm --network container:apisix-gateway curlimages/curl"

echo "📝 Registering routes..."

# Auth routes — NO key-auth
$RUN -s -o /dev/null -w "Auth: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/4 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/api/auth/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "ai-agent-service:8000": 1 }
    },
    "plugins": {
      "prometheus": {},
      "cors": { "allow_origins": "http://localhost:5173", "allow_methods": "*", "allow_headers": "*" }
    }
  }'

# Chat routes — NO key-auth
$RUN -s -o /dev/null -w "Chats: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/3 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/api/v1/chats*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "ai-agent-service:8000": 1 }
    },
    "plugins": {
      "prometheus": {},
      "cors": { "allow_origins": "http://localhost:5173", "allow_methods": "*", "allow_headers": "*" },
      "limit-count": {
        "count": 60,
        "time_window": 60,
        "rejected_code": 429,
        "key": "consumer_name"
      }
    }
  }'

# Agent routes — NO key-auth
$RUN -s -o /dev/null -w "Agent: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/1 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/api/v1/agent/*",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "ai-agent-service:8000": 1 },
      "timeout": { "connect": 10, "send": 10, "read": 300 }
    },
    "plugins": {
      "prometheus": {},
      "cors": { "allow_origins": "http://localhost:5173", "allow_methods": "*", "allow_headers": "*" },
      "limit-count": {
        "count": 20,
        "time_window": 60,
        "rejected_code": 429,
        "key": "consumer_name"
      }
    }
  }'

# Health route
$RUN -s -o /dev/null -w "Health: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/2 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/health",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "ai-agent-service:8000": 1 }
    },
    "plugins": {
      "prometheus": {},
      "cors": { "allow_origins": "*", "allow_methods": "*", "allow_headers": "*" }
    }
  }'

# Prometheus public route
$RUN -s -o /dev/null -w "Prometheus: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/5 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/apisix/prometheus/metrics",
    "plugins": {
      "public-api": {}
    }
  }'

# AI Agent metrics route
$RUN -s -o /dev/null -w "Metrics: %{http_code}\n" \
  http://127.0.0.1:9180/apisix/admin/routes/6 \
  -H "X-API-KEY: $ADMIN_KEY" -X PUT -d '{
    "uri": "/metrics",
    "upstream": {
      "type": "roundrobin",
      "nodes": { "ai-agent-service:8000": 1 }
    }
  }'

echo "✅ Routes registered!"