#!/bin/bash

# Aizen vNE - SSL Certificate Validation Script
# This script validates the local SSL setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="infrastructure/ssl"
REQUIRED_HOSTS=(
    "aizen.local"
    "api.aizen.local"
    "app.aizen.local"
    "device.aizen.local"
    "ai.aizen.local"
)

echo -e "${GREEN}=== Aizen vNE SSL Validation ===${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Check mkcert installation
check_mkcert() {
    echo -e "${BLUE}Checking mkcert installation...${NC}"
    if command -v mkcert &> /dev/null; then
        echo -e "${GREEN}✓${NC} mkcert is installed"
        mkcert_version=$(mkcert -version 2>&1)
        echo "  Version: $mkcert_version"
    else
        echo -e "${RED}✗${NC} mkcert is not installed"
        ((ERRORS++))
    fi
}

# Check CA installation
check_ca() {
    echo -e "\n${BLUE}Checking Certificate Authority...${NC}"
    if mkcert -check 2>&1 | grep -q "The local CA is installed"; then
        echo -e "${GREEN}✓${NC} Local CA is installed and trusted"
    else
        echo -e "${YELLOW}⚠${NC} Local CA may not be properly installed"
        echo "  Run: mkcert -install"
        ((WARNINGS++))
    fi
}

# Check SSL certificates
check_certificates() {
    echo -e "\n${BLUE}Checking SSL certificates...${NC}"
    
    if [ ! -d "$SSL_DIR" ]; then
        echo -e "${RED}✗${NC} SSL directory not found: $SSL_DIR"
        ((ERRORS++))
        return
    fi
    
    if [ -f "$SSL_DIR/cert.pem" ]; then
        echo -e "${GREEN}✓${NC} Certificate found: $SSL_DIR/cert.pem"
        
        # Check certificate validity
        if openssl x509 -in "$SSL_DIR/cert.pem" -noout -checkend 0 &> /dev/null; then
            echo -e "${GREEN}✓${NC} Certificate is valid"
            
            # Show certificate details
            subject=$(openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject 2>/dev/null | sed 's/subject=//')
            expires=$(openssl x509 -in "$SSL_DIR/cert.pem" -noout -enddate 2>/dev/null | sed 's/notAfter=//')
            echo "  Subject: $subject"
            echo "  Expires: $expires"
            
            # Check SANs
            echo -e "\n  ${BLUE}Certificate covers:${NC}"
            openssl x509 -in "$SSL_DIR/cert.pem" -noout -text 2>/dev/null | \
                grep -A 1 "Subject Alternative Name" | \
                tail -1 | \
                sed 's/DNS://g' | \
                tr ',' '\n' | \
                while read -r domain; do
                    echo "    - $(echo $domain | xargs)"
                done
        else
            echo -e "${RED}✗${NC} Certificate has expired or is invalid"
            ((ERRORS++))
        fi
    else
        echo -e "${RED}✗${NC} Certificate not found: $SSL_DIR/cert.pem"
        ((ERRORS++))
    fi
    
    if [ -f "$SSL_DIR/key.pem" ]; then
        echo -e "${GREEN}✓${NC} Private key found: $SSL_DIR/key.pem"
        
        # Check key permissions
        perms=$(stat -f "%OLp" "$SSL_DIR/key.pem" 2>/dev/null || stat -c "%a" "$SSL_DIR/key.pem" 2>/dev/null)
        if [ "$perms" = "600" ]; then
            echo -e "${GREEN}✓${NC} Private key has correct permissions (600)"
        else
            echo -e "${YELLOW}⚠${NC} Private key permissions are $perms (should be 600)"
            ((WARNINGS++))
        fi
    else
        echo -e "${RED}✗${NC} Private key not found: $SSL_DIR/key.pem"
        ((ERRORS++))
    fi
}

# Check hosts file entries
check_hosts() {
    echo -e "\n${BLUE}Checking /etc/hosts entries...${NC}"
    
    for host in "${REQUIRED_HOSTS[@]}"; do
        if grep -q "$host" /etc/hosts; then
            echo -e "${GREEN}✓${NC} $host is configured in /etc/hosts"
        else
            echo -e "${YELLOW}⚠${NC} $host is not configured in /etc/hosts"
            ((WARNINGS++))
        fi
    done
}

# Check environment variables
check_env() {
    echo -e "\n${BLUE}Checking environment configuration...${NC}"
    
    if [ -f ".env.ssl" ]; then
        echo -e "${GREEN}✓${NC} .env.ssl file exists"
        
        # Check key variables
        if grep -q "HTTPS_ENABLED=true" .env.ssl; then
            echo -e "${GREEN}✓${NC} HTTPS is enabled in configuration"
        else
            echo -e "${YELLOW}⚠${NC} HTTPS may not be enabled in configuration"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠${NC} .env.ssl file not found"
        echo "  This file should contain SSL configuration variables"
        ((WARNINGS++))
    fi
}

# Test HTTPS connectivity
test_connectivity() {
    echo -e "\n${BLUE}Testing HTTPS connectivity...${NC}"
    
    # Check if services are running
    if ! docker ps &> /dev/null; then
        echo -e "${YELLOW}⚠${NC} Docker is not running - skipping connectivity tests"
        return
    fi
    
    # Test each service endpoint (if running)
    SERVICES=(
        "api.aizen.local:3443:API Gateway"
        "app.aizen.local:3444:Web Portal"
        "device.aizen.local:3445:Device Agent"
        "ai.aizen.local:3446:AI Orchestrator"
    )
    
    for service_info in "${SERVICES[@]}"; do
        IFS=':' read -r host port name <<< "$service_info"
        url="https://$host:$port/health"
        
        echo -n "  Testing $name ($url)... "
        
        if curl -k -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "$url" &> /dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${YELLOW}Not running${NC}"
        fi
    done
}

# Summary
show_summary() {
    echo ""
    echo -e "${BLUE}=== Validation Summary ===${NC}"
    echo ""
    
    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo "Your SSL setup is properly configured."
    elif [ $ERRORS -eq 0 ]; then
        echo -e "${YELLOW}⚠ Validation completed with $WARNINGS warning(s)${NC}"
        echo "Your SSL setup is functional but could be improved."
    else
        echo -e "${RED}✗ Validation failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
        echo "Please run ./scripts/setup-ssl.sh to fix the issues."
    fi
    
    echo ""
    echo "For detailed setup instructions, see: docs/ssl-setup.md"
}

# Main execution
main() {
    check_mkcert
    check_ca
    check_certificates
    check_hosts
    check_env
    test_connectivity
    show_summary
}

# Run main function
main

exit $ERRORS