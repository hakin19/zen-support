#!/bin/bash

# Aizen vNE - Update /etc/hosts for Local Development
# This script adds required host entries for SSL development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Aizen vNE Hosts File Configuration ===${NC}"
echo ""

# Host entries to add
HOSTS_ENTRIES=(
    "127.0.0.1 aizen.local"
    "127.0.0.1 api.aizen.local"
    "127.0.0.1 app.aizen.local"
    "127.0.0.1 device.aizen.local"
    "127.0.0.1 ai.aizen.local"
)

# Check current hosts file
echo -e "${YELLOW}Checking current /etc/hosts file...${NC}"
echo ""

MISSING_ENTRIES=()
for entry in "${HOSTS_ENTRIES[@]}"; do
    host=$(echo "$entry" | awk '{print $2}')
    if grep -q "$host" /etc/hosts; then
        echo -e "${GREEN}✓${NC} $host already configured"
    else
        echo -e "${YELLOW}○${NC} $host needs to be added"
        MISSING_ENTRIES+=("$entry")
    fi
done

if [ ${#MISSING_ENTRIES[@]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All host entries are already configured!${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}The following entries need to be added to /etc/hosts:${NC}"
echo ""
echo "# Aizen vNE Development"
for entry in "${MISSING_ENTRIES[@]}"; do
    echo "$entry"
done
echo ""

# Ask for confirmation
read -p "Do you want to add these entries to /etc/hosts? (requires sudo) [y/N]: " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Operation cancelled${NC}"
    echo ""
    echo "You can manually add the entries to /etc/hosts:"
    echo ""
    echo "sudo nano /etc/hosts"
    echo ""
    echo "Then add:"
    echo "# Aizen vNE Development"
    for entry in "${MISSING_ENTRIES[@]}"; do
        echo "$entry"
    done
    exit 0
fi

# Backup hosts file
echo ""
echo -e "${YELLOW}Creating backup of /etc/hosts...${NC}"
BACKUP_FILE="/etc/hosts.backup.$(date +%Y%m%d_%H%M%S)"
sudo cp /etc/hosts "$BACKUP_FILE"
echo -e "${GREEN}✓${NC} Backup created: $BACKUP_FILE"

# Add entries
echo ""
echo -e "${YELLOW}Adding entries to /etc/hosts...${NC}"

# Add a comment header if it doesn't exist
if ! grep -q "# Aizen vNE Development" /etc/hosts; then
    echo "" | sudo tee -a /etc/hosts > /dev/null
    echo "# Aizen vNE Development" | sudo tee -a /etc/hosts > /dev/null
fi

# Add each missing entry
for entry in "${MISSING_ENTRIES[@]}"; do
    echo "$entry" | sudo tee -a /etc/hosts > /dev/null
    echo -e "${GREEN}✓${NC} Added: $entry"
done

echo ""
echo -e "${GREEN}=== Hosts Configuration Complete! ===${NC}"
echo ""
echo "You can now access services using:"
echo "  - https://api.aizen.local:3443  (API Gateway)"
echo "  - https://app.aizen.local:3444  (Web Portal)"
echo "  - https://device.aizen.local:3445  (Device Agent)"
echo "  - https://ai.aizen.local:3446  (AI Orchestrator)"
echo ""
echo "To remove these entries later, edit /etc/hosts and remove"
echo "the lines under '# Aizen vNE Development'"