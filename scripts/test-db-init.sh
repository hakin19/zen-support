#!/bin/bash

# Test Database Initialization Script
# This script initializes the test database for running tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Test Database Initialization ===${NC}"

# Function to check if Supabase is running
check_supabase() {
    echo -e "${YELLOW}Checking Supabase status...${NC}"
    if npx supabase status 2>/dev/null | grep -q "RUNNING"; then
        echo -e "${GREEN}✓ Supabase is running${NC}"
        return 0
    else
        echo -e "${RED}✗ Supabase is not running${NC}"
        return 1
    fi
}

# Function to start Supabase
start_supabase() {
    echo -e "${YELLOW}Starting Supabase...${NC}"
    npx supabase start
    echo -e "${GREEN}✓ Supabase started${NC}"
}

# Function to reset the database
reset_database() {
    echo -e "${YELLOW}Resetting database...${NC}"
    npx supabase db reset --debug
    echo -e "${GREEN}✓ Database reset complete${NC}"
}

# Function to run migrations
run_migrations() {
    echo -e "${YELLOW}Running migrations...${NC}"
    npx supabase db push
    echo -e "${GREEN}✓ Migrations applied${NC}"
}

# Function to seed test data
seed_test_data() {
    echo -e "${YELLOW}Seeding test data...${NC}"
    
    # Check if seed files exist
    if [ -d "supabase/seed" ] && [ "$(ls -A supabase/seed/*.sql 2>/dev/null)" ]; then
        for seed_file in supabase/seed/*.sql; do
            echo -e "  Applying: $(basename $seed_file)"
            npx supabase db seed -f "$seed_file"
        done
        echo -e "${GREEN}✓ Test data seeded${NC}"
    else
        echo -e "${YELLOW}No seed files found, skipping...${NC}"
    fi
}

# Function to display connection info
display_connection_info() {
    echo -e "\n${GREEN}=== Connection Information ===${NC}"
    echo -e "API URL:        ${YELLOW}http://localhost:54321${NC}"
    echo -e "Database URL:   ${YELLOW}postgresql://postgres:postgres@localhost:54322/postgres${NC}"
    echo -e "Studio URL:     ${YELLOW}http://localhost:54323${NC}"
    echo -e "Inbucket URL:   ${YELLOW}http://localhost:54324${NC}"
    echo -e "\nAnon Key:       ${YELLOW}eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0${NC}"
    echo -e "Service Key:    ${YELLOW}eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU${NC}"
}

# Main execution
main() {
    # Parse command line arguments
    COMMAND=${1:-"init"}
    
    case $COMMAND in
        init)
            # Full initialization
            if ! check_supabase; then
                start_supabase
            fi
            reset_database
            run_migrations
            seed_test_data
            display_connection_info
            ;;
        reset)
            # Just reset the database
            if ! check_supabase; then
                echo -e "${RED}Error: Supabase is not running. Run 'npm run test:supabase:start' first.${NC}"
                exit 1
            fi
            reset_database
            run_migrations
            seed_test_data
            ;;
        start)
            # Just start Supabase
            start_supabase
            display_connection_info
            ;;
        stop)
            # Stop Supabase
            echo -e "${YELLOW}Stopping Supabase...${NC}"
            npx supabase stop
            echo -e "${GREEN}✓ Supabase stopped${NC}"
            ;;
        status)
            # Check status
            npx supabase status
            ;;
        *)
            echo -e "${RED}Unknown command: $COMMAND${NC}"
            echo "Usage: $0 [init|reset|start|stop|status]"
            echo "  init   - Full initialization (start, reset, migrate, seed)"
            echo "  reset  - Reset database and re-apply migrations"
            echo "  start  - Start Supabase"
            echo "  stop   - Stop Supabase"
            echo "  status - Check Supabase status"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"