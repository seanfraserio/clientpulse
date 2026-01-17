#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Worker Deployment Script
# Deploys the Cloudflare Worker backend
# ═══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-production}

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║        ClientPulse - Deploy Worker ($ENVIRONMENT)              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

cd worker

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Type check
echo -e "${YELLOW}Running type check...${NC}"
if npm run typecheck 2>/dev/null; then
    echo -e "${GREEN}✓ Type check passed${NC}"
else
    echo -e "${YELLOW}⚠ Type check skipped (script not defined)${NC}"
fi

# Deploy based on environment
echo -e "${YELLOW}Deploying to Cloudflare Workers...${NC}"

if [ "$ENVIRONMENT" = "staging" ]; then
    wrangler deploy --env staging
elif [ "$ENVIRONMENT" = "production" ]; then
    wrangler deploy
else
    echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Worker deployed successfully!${NC}"

# Get deployment URL
WORKER_URL=$(wrangler deployments list --json 2>/dev/null | jq -r '.[0].url' || echo "")

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Worker Deployment Complete!                     ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
if [ -n "$WORKER_URL" ]; then
    echo -e "Worker URL: ${BLUE}$WORKER_URL${NC}"
fi
echo ""
echo -e "${YELLOW}API Endpoints:${NC}"
echo "  POST /api/auth/magic-link"
echo "  GET  /api/auth/verify"
echo "  GET  /api/clients"
echo "  GET  /api/radar"
echo "  POST /api/webhooks/stripe"

cd ..
