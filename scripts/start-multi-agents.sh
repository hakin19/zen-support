#!/bin/bash

# Start multiple device agents using Docker Compose
# Usage: ./scripts/start-multi-agents.sh

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

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Starting Multi-Agent Device Emulation Environment   ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

echo -e "${YELLOW}→ Checking Docker Compose file...${NC}"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}✗ Docker Compose file not found: $COMPOSE_FILE${NC}"
    exit 1
fi

# Validate Docker Compose file
echo -e "${YELLOW}→ Validating Docker Compose configuration...${NC}"
if docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Docker Compose configuration is valid${NC}"
else
    echo -e "${RED}✗ Invalid Docker Compose configuration${NC}"
    exit 1
fi

# Build images
echo -e "${YELLOW}→ Building device agent images...${NC}"
docker compose -f "$COMPOSE_FILE" build --parallel

# Start services
echo -e "${YELLOW}→ Starting all services...${NC}"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d

# Wait for services to be healthy
echo -e "${YELLOW}→ Waiting for services to become healthy...${NC}"
sleep 5

# Check service status
echo -e "${YELLOW}→ Checking service status...${NC}"
echo ""

# Function to check service health
check_service() {
    local service=$1
    local container_name=$2
    
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "$container_name.*healthy"; then
        echo -e "${GREEN}✓ $service is healthy${NC}"
        return 0
    elif docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        echo -e "${YELLOW}⚠ $service is running but not healthy yet${NC}"
        return 1
    else
        echo -e "${RED}✗ $service is not running${NC}"
        return 1
    fi
}

# Check each service
all_healthy=true
check_service "Redis" "aizen-redis-multi" || all_healthy=false
check_service "Device Agent 1 (US-WEST)" "device-agent-us-west-001" || all_healthy=false
check_service "Device Agent 2 (US-EAST)" "device-agent-us-east-001" || all_healthy=false
check_service "Device Agent 3 (EU-CENTRAL)" "device-agent-eu-central-001" || all_healthy=false
check_service "Log Aggregator" "aizen-log-aggregator" || all_healthy=false

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}✓ All services are running successfully!${NC}"
    echo ""
    echo -e "${BLUE}Device Agent IDs:${NC}"
    echo -e "  • US-WEST:    DEV-US-WEST-001"
    echo -e "  • US-EAST:    DEV-US-EAST-001"
    echo -e "  • EU-CENTRAL: DEV-EU-CENTRAL-001"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo -e "  • View logs:    ${YELLOW}./scripts/view-agent-logs.sh${NC}"
    echo -e "  • Stop agents:  ${YELLOW}./scripts/stop-multi-agents.sh${NC}"
    echo -e "  • Scale agents: ${YELLOW}./scripts/scale-agents.sh${NC}"
else
    echo -e "${YELLOW}⚠ Some services are not fully healthy yet${NC}"
    echo -e "  Run ${YELLOW}docker compose -f $COMPOSE_FILE ps${NC} to check status"
    echo -e "  Run ${YELLOW}docker compose -f $COMPOSE_FILE logs${NC} to view logs"
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"