#!/bin/bash

# Stop all device agents
# Usage: ./scripts/stop-multi-agents.sh

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
echo -e "${BLUE}   Stopping Multi-Agent Device Emulation Environment   ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

# Check if services are running
echo -e "${YELLOW}→ Checking running services...${NC}"
running_containers=$(docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps -q 2>/dev/null | wc -l | tr -d ' ')

if [ "$running_containers" -eq "0" ]; then
    echo -e "${YELLOW}⚠ No services are currently running${NC}"
else
    echo -e "${GREEN}✓ Found $running_containers running containers${NC}"
    
    # Stop services
    echo -e "${YELLOW}→ Stopping all services...${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down
    
    echo -e "${GREEN}✓ All services stopped successfully${NC}"
fi

# Optional: Clean up volumes
echo ""
read -p "Do you want to remove data volumes? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}→ Removing data volumes...${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v
    echo -e "${GREEN}✓ Data volumes removed${NC}"
fi

# Optional: Clean up images
echo ""
read -p "Do you want to remove built images? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}→ Removing built images...${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down --rmi local
    echo -e "${GREEN}✓ Images removed${NC}"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Shutdown complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"