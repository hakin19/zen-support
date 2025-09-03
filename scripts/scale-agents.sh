#!/bin/bash

# Scale device agents up or down
# Usage: ./scripts/scale-agents.sh [number]

set -e

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.multi-agent.yml"
PROJECT_NAME="aizen-multi-agent"
MAX_AGENTS=10

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Device Agent Scaler                       ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

# Parse arguments
if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Current agent configuration:${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps --format "table {{.Service}}\t{{.Status}}"
    echo ""
    read -p "Enter number of agents to scale to (1-$MAX_AGENTS): " SCALE_TO
else
    SCALE_TO=$1
fi

# Validate input
if ! [[ "$SCALE_TO" =~ ^[0-9]+$ ]] || [ "$SCALE_TO" -lt 1 ] || [ "$SCALE_TO" -gt "$MAX_AGENTS" ]; then
    echo -e "${RED}✗ Invalid number. Please enter a number between 1 and $MAX_AGENTS${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Generating scaled Docker Compose configuration...${NC}"

# Create a temporary scaled compose file
SCALED_COMPOSE_FILE="docker-compose.multi-agent.scaled.yml"

cat > "$SCALED_COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  # Redis service (shared)
  redis:
    image: redis:7.4-alpine
    container_name: aizen-redis-multi
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    networks:
      - aizen-network
    restart: unless-stopped

EOF

# Define location array
LOCATIONS=("US-WEST" "US-EAST" "EU-CENTRAL" "AP-SOUTH" "AF-NORTH")

# Generate agent services
for ((i=1; i<=$SCALE_TO; i++)); do
    LOCATION=${LOCATIONS[$((($i-1) % ${#LOCATIONS[@]}))]}
    INDEX=$(printf "%03d" $i)
    
    cat >> "$SCALED_COMPOSE_FILE" << EOF
  # Device Agent $i - $LOCATION
  device-agent-$i:
    build:
      context: ./packages/device-agent
      dockerfile: Dockerfile
    container_name: device-agent-$(echo $LOCATION | tr '[:upper:]' '[:lower:]')-$INDEX
    environment:
      NODE_ENV: \${NODE_ENV:-development}
      DEVICE_ID: DEV-$LOCATION-$INDEX
      API_URL: \${API_URL:-http://host.docker.internal:3001}
      API_KEY: \${API_KEY}
      LOCATION: $LOCATION
      DEVICE_INDEX: $i
      LOG_LEVEL: \${LOG_LEVEL:-info}
      HEARTBEAT_INTERVAL: \${HEARTBEAT_INTERVAL:-30000}
      MAX_COMMAND_TIMEOUT: \${MAX_COMMAND_TIMEOUT:-30000}
      REDIS_URL: redis://redis:6379
    volumes:
      - ./packages/device-agent:/app
      - /app/node_modules
      - agent${i}-logs:/app/logs
    networks:
      - aizen-network
      - agent-isolated-network
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: unless-stopped

EOF
done

# Add log aggregator
cat >> "$SCALED_COMPOSE_FILE" << EOF
  # Log Aggregator
  log-aggregator:
    image: fluent/fluentd:v1.17-debian
    container_name: aizen-log-aggregator
    volumes:
      - ./config/fluentd:/fluentd/etc
EOF

# Add volume mounts for logs
for ((i=1; i<=$SCALE_TO; i++)); do
    echo "      - agent${i}-logs:/logs/agent${i}:ro" >> "$SCALED_COMPOSE_FILE"
done

cat >> "$SCALED_COMPOSE_FILE" << EOF
      - aggregated-logs:/fluentd/log
    environment:
      FLUENTD_CONF: fluent.conf
    networks:
      - aizen-network
    depends_on:
EOF

# Add dependencies
for ((i=1; i<=$SCALE_TO; i++)); do
    echo "      - device-agent-$i" >> "$SCALED_COMPOSE_FILE"
done

cat >> "$SCALED_COMPOSE_FILE" << EOF
    restart: unless-stopped

networks:
  aizen-network:
    driver: bridge
    name: aizen-network-multi
  
  agent-isolated-network:
    driver: bridge
    internal: true
    name: agent-isolated-network

volumes:
  redis-data:
    name: aizen-redis-data-multi
EOF

# Add volumes
for ((i=1; i<=$SCALE_TO; i++)); do
    echo "  agent${i}-logs:" >> "$SCALED_COMPOSE_FILE"
    echo "    name: aizen-agent${i}-logs" >> "$SCALED_COMPOSE_FILE"
done

echo "  aggregated-logs:" >> "$SCALED_COMPOSE_FILE"
echo "    name: aizen-aggregated-logs" >> "$SCALED_COMPOSE_FILE"

echo -e "${GREEN}✓ Generated configuration for $SCALE_TO agents${NC}"

# Stop existing services
echo -e "${YELLOW}→ Stopping existing services...${NC}"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down 2>/dev/null || true

# Start scaled services
echo -e "${YELLOW}→ Starting $SCALE_TO device agents...${NC}"
docker compose -f "$SCALED_COMPOSE_FILE" -p "$PROJECT_NAME" up -d --build

# Wait for services
echo -e "${YELLOW}→ Waiting for services to start...${NC}"
sleep 5

# Check status
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Scaled to $SCALE_TO device agents${NC}"
echo ""
echo -e "${YELLOW}Agent configuration:${NC}"
docker compose -f "$SCALED_COMPOSE_FILE" -p "$PROJECT_NAME" ps --format "table {{.Service}}\t{{.Status}}"
echo ""
echo -e "${BLUE}Generated device IDs:${NC}"
for ((i=1; i<=$SCALE_TO; i++)); do
    LOCATION=${LOCATIONS[$((($i-1) % ${#LOCATIONS[@]}))]}
    INDEX=$(printf "%03d" $i)
    echo -e "  • Agent $i: DEV-$LOCATION-$INDEX"
done
echo ""
echo -e "${BLUE}Scaled compose file saved as: $SCALED_COMPOSE_FILE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"