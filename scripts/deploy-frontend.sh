#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Frontend Deployment Script
# Builds and deploys the Astro frontend to Cloudflare Pages
# ═══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-production}
PROJECT_NAME="clientpulse"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║       ClientPulse - Deploy Frontend ($ENVIRONMENT)             ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Build
echo -e "${YELLOW}Building frontend...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"

# Check if Pages project exists
echo -e "${YELLOW}Checking Cloudflare Pages project...${NC}"
if ! wrangler pages project list 2>/dev/null | grep -q "$PROJECT_NAME"; then
    echo -e "${YELLOW}Creating Pages project...${NC}"
    wrangler pages project create "$PROJECT_NAME" --production-branch main
    echo -e "${GREEN}✓ Pages project created${NC}"
else
    echo -e "${GREEN}✓ Pages project exists${NC}"
fi

# Deploy to Cloudflare Pages
echo -e "${YELLOW}Deploying to Cloudflare Pages...${NC}"

if [ "$ENVIRONMENT" = "staging" ]; then
    DEPLOY_OUTPUT=$(wrangler pages deploy dist --project-name="$PROJECT_NAME" --branch=staging)
elif [ "$ENVIRONMENT" = "production" ]; then
    DEPLOY_OUTPUT=$(wrangler pages deploy dist --project-name="$PROJECT_NAME" --branch=main)
else
    echo -e "${RED}Unknown environment: $ENVIRONMENT${NC}"
    exit 1
fi

# Extract URL from output
PAGES_URL=$(echo "$DEPLOY_OUTPUT" | grep -oP 'https://[^\s]+\.pages\.dev' | head -1 || echo "")

echo -e "${GREEN}✓ Frontend deployed successfully!${NC}"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Frontend Deployment Complete!                    ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
if [ -n "$PAGES_URL" ]; then
    echo -e "Pages URL: ${BLUE}$PAGES_URL${NC}"
fi
echo ""
echo -e "${YELLOW}Pages:${NC}"
echo "  /              - Landing page"
echo "  /login         - Magic link login"
echo "  /dashboard     - Relationship Radar"
echo "  /clients       - Client management"
echo "  /settings      - User settings"
