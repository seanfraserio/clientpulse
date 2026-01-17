#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Database Migration Script
# Runs migrations on local or remote D1
# ═══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-local}

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║          ClientPulse - Database Migration                 ║"
echo "║          Environment: $ENVIRONMENT                             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

cd worker

if [ "$ENVIRONMENT" = "local" ]; then
    echo -e "${YELLOW}Running migrations on local D1...${NC}"
    wrangler d1 execute clientpulse-db --file=src/db/schema.sql --local
elif [ "$ENVIRONMENT" = "remote" ] || [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}Running migrations on remote D1...${NC}"
    echo -e "${RED}⚠ This will modify the production database!${NC}"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wrangler d1 execute clientpulse-db --file=src/db/schema.sql --remote
    else
        echo "Aborted."
        exit 1
    fi
else
    echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
    echo "Usage: ./scripts/migrate.sh [local|remote]"
    exit 1
fi

echo -e "${GREEN}✓ Migrations complete${NC}"

cd ..
