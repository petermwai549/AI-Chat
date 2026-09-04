# services/ai-agent-service/app/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# ============================================
# Generation Metrics
# ============================================
GENERATION_REQUESTS = Counter(
    'ai_agent_generation_requests_total',
    'Total number of generation requests',
    ['model', 'status']
)

GENERATION_DURATION = Histogram(
    'ai_agent_generation_duration_seconds',
    'Duration of generation requests in seconds',
    ['model']
)

GENERATION_TOKENS = Counter(
    'ai_agent_generation_tokens_total',
    'Total number of tokens processed',
    ['model', 'type']
)

GENERATION_ACTIVE = Gauge(
    'ai_agent_generation_active',
    'Number of active generation requests'
)

# ============================================
# HTTP Metrics (for middleware)
# ============================================
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

ACTIVE_REQUESTS = Gauge(
    'http_active_requests',
    'Active HTTP requests'
)