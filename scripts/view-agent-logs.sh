#!/bin/bash

# View logs from device agents
# Usage: ./scripts/view-agent-logs.sh [agent-number|all]

set -e

# Color definitions for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.multi-agent.yml"
PROJECT_NAME="aizen-multi-agent"

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}          Device Agent Logs Viewer                      ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

# Parse arguments
AGENT_SELECTION=${1:-"menu"}

# Function to view logs for a specific service
view_logs() {
    local service=$1
    local container=$2
    local follow=${3:-false}
    
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}Logs for $service${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    
    if [ "$follow" = true ]; then
        docker logs -f "$container" 2>&1
    else
        docker logs --tail 100 "$container" 2>&1
    fi
}

# Function to show menu
show_menu() {
    echo -e "${YELLOW}Select which logs to view:${NC}"
    echo "  1) Device Agent 1 (US-WEST)"
    echo "  2) Device Agent 2 (US-EAST)"
    echo "  3) Device Agent 3 (EU-CENTRAL)"
    echo "  4) Redis"
    echo "  5) Log Aggregator"
    echo "  6) All agents (combined)"
    echo "  7) All services (combined)"
    echo "  8) Follow mode (live logs)"
    echo "  q) Quit"
    echo ""
    read -p "Enter selection: " selection
    
    case $selection in
        1)
            view_logs "Device Agent 1 (US-WEST)" "device-agent-us-west-001"
            ;;
        2)
            view_logs "Device Agent 2 (US-EAST)" "device-agent-us-east-001"
            ;;
        3)
            view_logs "Device Agent 3 (EU-CENTRAL)" "device-agent-eu-central-001"
            ;;
        4)
            view_logs "Redis" "aizen-redis-multi"
            ;;
        5)
            view_logs "Log Aggregator" "aizen-log-aggregator"
            ;;
        6)
            echo -e "${CYAN}Combined logs from all device agents:${NC}"
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs --tail 100 \
                device-agent-1 device-agent-2 device-agent-3
            ;;
        7)
            echo -e "${CYAN}Combined logs from all services:${NC}"
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs --tail 100
            ;;
        8)
            follow_menu
            ;;
        q|Q)
            echo -e "${GREEN}Exiting...${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid selection${NC}"
            show_menu
            ;;
    esac
}

# Function for follow mode menu
follow_menu() {
    echo ""
    echo -e "${YELLOW}Select which logs to follow (live):${NC}"
    echo "  1) Device Agent 1 (US-WEST)"
    echo "  2) Device Agent 2 (US-EAST)"
    echo "  3) Device Agent 3 (EU-CENTRAL)"
    echo "  4) All agents"
    echo "  5) All services"
    echo "  b) Back"
    echo ""
    read -p "Enter selection: " follow_selection
    
    case $follow_selection in
        1)
            view_logs "Device Agent 1 (US-WEST)" "device-agent-us-west-001" true
            ;;
        2)
            view_logs "Device Agent 2 (US-EAST)" "device-agent-us-east-001" true
            ;;
        3)
            view_logs "Device Agent 3 (EU-CENTRAL)" "device-agent-eu-central-001" true
            ;;
        4)
            echo -e "${CYAN}Following logs from all device agents (Ctrl+C to stop):${NC}"
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f \
                device-agent-1 device-agent-2 device-agent-3
            ;;
        5)
            echo -e "${CYAN}Following logs from all services (Ctrl+C to stop):${NC}"
            docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs -f
            ;;
        b|B)
            show_menu
            ;;
        *)
            echo -e "${RED}Invalid selection${NC}"
            follow_menu
            ;;
    esac
}

# Handle direct agent selection
case $AGENT_SELECTION in
    1)
        view_logs "Device Agent 1 (US-WEST)" "device-agent-us-west-001"
        ;;
    2)
        view_logs "Device Agent 2 (US-EAST)" "device-agent-us-east-001"
        ;;
    3)
        view_logs "Device Agent 3 (EU-CENTRAL)" "device-agent-eu-central-001"
        ;;
    all)
        echo -e "${CYAN}Combined logs from all services:${NC}"
        docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs --tail 100
        ;;
    menu|*)
        show_menu
        ;;
esac

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"