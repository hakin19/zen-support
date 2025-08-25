#!/bin/bash

# Aizen vNE - SSL Certificate Renewal Script
# This script renews local SSL certificates using mkcert

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="infrastructure/ssl"
DOMAINS=(
    "aizen.local"
    "*.aizen.local"
    "api.aizen.local"
    "app.aizen.local"
    "device.aizen.local"
    "ai.aizen.local"
    "localhost"
    "127.0.0.1"
)

echo -e "${GREEN}=== Aizen vNE SSL Certificate Renewal ===${NC}"
echo ""

# Check if mkcert is installed
if ! command -v mkcert &> /dev/null; then
    echo -e "${RED}Error: mkcert is not installed${NC}"
    echo "Please run ./scripts/setup-ssl.sh first"
    exit 1
fi

# Check if SSL directory exists
if [ ! -d "$SSL_DIR" ]; then
    echo -e "${RED}Error: SSL directory not found${NC}"
    echo "Please run ./scripts/setup-ssl.sh first"
    exit 1
fi

# Backup existing certificates
echo -e "${YELLOW}Backing up existing certificates...${NC}"
if [ -f "$SSL_DIR/cert.pem" ]; then
    mv "$SSL_DIR/cert.pem" "$SSL_DIR/cert.pem.backup.$(date +%Y%m%d_%H%M%S)"
fi
if [ -f "$SSL_DIR/key.pem" ]; then
    mv "$SSL_DIR/key.pem" "$SSL_DIR/key.pem.backup.$(date +%Y%m%d_%H%M%S)"
fi
echo -e "${GREEN}✓${NC} Existing certificates backed up"

# Generate new certificates
echo -e "\n${YELLOW}Generating new SSL certificates...${NC}"
cd "$SSL_DIR"

# Generate certificate
mkcert "${DOMAINS[@]}"

# Rename to standard names
mv "aizen.local+7.pem" "cert.pem" 2>/dev/null || mv "aizen.local+7-cert.pem" "cert.pem" 2>/dev/null || true
mv "aizen.local+7-key.pem" "key.pem" 2>/dev/null || true

# Set appropriate permissions
chmod 644 cert.pem
chmod 600 key.pem

cd ../..

echo -e "${GREEN}✓${NC} SSL certificates renewed"
echo "  Certificate: $SSL_DIR/cert.pem"
echo "  Private Key: $SSL_DIR/key.pem"

# Check if Docker is running and offer to restart services
if command -v docker &> /dev/null && docker ps &> /dev/null; then
    echo ""
    read -p "Do you want to restart Docker services to use the new certificates? [y/N]: " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Restarting Docker services...${NC}"
        docker-compose -f infrastructure/docker/docker-compose.yml restart
        echo -e "${GREEN}✓${NC} Docker services restarted"
    fi
fi

echo ""
echo -e "${GREEN}=== Certificate Renewal Complete! ===${NC}"
echo ""
echo "The new certificates are now active."
echo "You may need to restart your development servers if they're running."