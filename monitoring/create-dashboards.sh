#!/bin/bash
# create-dashboards.sh - Import dashboards into Grafana

set -e

GRAFANA_URL="http://localhost:6100"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-admin}"

echo "📊 Creating dashboards in Grafana..."

# Wait for Grafana to be ready
until curl -s -f "${GRAFANA_URL}/api/health" > /dev/null 2>&1; do
  echo "⏳ Waiting for Grafana..."
  sleep 5
done

echo "✅ Grafana is ready"

# Function to create dashboard
create_dashboard() {
  local file=$1
  local name=$(basename "$file" .json)
  
  echo "📝 Creating dashboard: $name"
  
  # Check if dashboard exists
  local uid=$(jq -r '.uid' "$file")
  local exists=$(curl -s -o /dev/null -w "%{http_code}" \
    -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
    "${GRAFANA_URL}/api/dashboards/uid/${uid}")
  
  if [ "$exists" = "200" ]; then
    echo "⏭️ Dashboard $name already exists, updating..."
    # Update existing dashboard
    cat "$file" | \
      jq '.id = null' | \
      jq '.version += 1' > /tmp/dashboard.json
  else
    # Create new dashboard
    cat "$file" | \
      jq '.id = null' | \
      jq '.version = 1' > /tmp/dashboard.json
  fi
  
  # Create/update dashboard via API
  curl -s -X POST "${GRAFANA_URL}/api/dashboards/db" \
    -H "Content-Type: application/json" \
    -u "${GRAFANA_USER}:${GRAFANA_PASSWORD}" \
    -d @/tmp/dashboard.json > /dev/null
  
  echo "✅ Dashboard '$name' created/updated"
}

# Create all dashboards
for file in ./dashboards/*.json; do
  if [ -f "$file" ]; then
    create_dashboard "$file"
  fi
done

echo ""
echo "✅ All dashboards created!"
echo "🔗 Access Grafana: ${GRAFANA_URL}"
echo "👤 Login: ${GRAFANA_USER} / ${GRAFANA_PASSWORD}"