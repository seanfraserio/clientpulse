#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Initial Setup Script
# Creates all required Cloudflare resources
# ═══════════════════════════════════════════════════════════

set -e

# Fix wrangler logs directory if it has permission issues
WRANGLER_LOGS_DIR="$HOME/Library/Preferences/.wrangler/logs"
if [ -d "$WRANGLER_LOGS_DIR" ] && ! [ -w "$WRANGLER_LOGS_DIR" ]; then
    echo "Fixing wrangler logs directory permissions..."
    rm -rf "$WRANGLER_LOGS_DIR" 2>/dev/null || true
    mkdir -p "$WRANGLER_LOGS_DIR" 2>/dev/null || true
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           ClientPulse - Initial Setup                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler CLI not found${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"

# Check Cloudflare login
echo -e "${YELLOW}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Please login to Cloudflare:${NC}"
    wrangler login
fi
echo -e "${GREEN}✓ Authenticated with Cloudflare${NC}"

# Create D1 Database
echo ""
echo -e "${BLUE}Creating D1 Database...${NC}"
D1_OUTPUT=$(wrangler d1 create clientpulse-db 2>&1) || true

if echo "$D1_OUTPUT" | grep -q "already exists"; then
    echo -e "${YELLOW}⚠ Database 'clientpulse-db' already exists${NC}"
    D1_ID=$(wrangler d1 list --json | jq -r '.[] | select(.name=="clientpulse-db") | .uuid')
else
    # macOS-compatible extraction (no grep -P)
    D1_ID=$(echo "$D1_OUTPUT" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p' | head -1)
    if [ -z "$D1_ID" ]; then
        D1_ID=$(wrangler d1 list --json | jq -r '.[] | select(.name=="clientpulse-db") | .uuid')
    fi
    echo -e "${GREEN}✓ Created D1 database${NC}"
fi
echo -e "  Database ID: ${BLUE}$D1_ID${NC}"

# Create KV Namespace for rate limiting
echo ""
echo -e "${BLUE}Creating KV Namespace for rate limiting...${NC}"
KV_OUTPUT=$(wrangler kv:namespace create RATE_LIMITS 2>&1) || true

if echo "$KV_OUTPUT" | grep -q "already exists"; then
    echo -e "${YELLOW}⚠ KV namespace already exists${NC}"
    KV_ID=$(wrangler kv:namespace list --json | jq -r '.[] | select(.title | contains("RATE_LIMITS")) | .id' | head -1)
else
    # macOS-compatible extraction (no grep -P)
    KV_ID=$(echo "$KV_OUTPUT" | sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -1)
    if [ -z "$KV_ID" ]; then
        KV_ID=$(wrangler kv:namespace list --json | jq -r '.[] | select(.title | contains("RATE_LIMITS")) | .id' | head -1)
    fi
    echo -e "${GREEN}✓ Created KV namespace${NC}"
fi
echo -e "  KV Namespace ID: ${BLUE}$KV_ID${NC}"

# Create Queue for AI processing
echo ""
echo -e "${BLUE}Creating Queue for AI processing...${NC}"
QUEUE_OUTPUT=$(wrangler queues create ai-processing-queue 2>&1) || true

if echo "$QUEUE_OUTPUT" | grep -q "already exists"; then
    echo -e "${YELLOW}⚠ Queue already exists${NC}"
else
    echo -e "${GREEN}✓ Created AI processing queue${NC}"
fi

# Update wrangler.toml with actual IDs
echo ""
echo -e "${BLUE}Updating wrangler.toml with resource IDs...${NC}"

WRANGLER_FILE="worker/wrangler.toml"
if [ -f "$WRANGLER_FILE" ]; then
    # Update D1 database_id
    if [ -n "$D1_ID" ]; then
        sed -i.bak "s/database_id = \".*\"/database_id = \"$D1_ID\"/" "$WRANGLER_FILE"
    fi

    # Update KV namespace id
    if [ -n "$KV_ID" ]; then
        sed -i.bak "s/id = \"your-kv-namespace-id\"/id = \"$KV_ID\"/" "$WRANGLER_FILE"
    fi

    rm -f "$WRANGLER_FILE.bak"
    echo -e "${GREEN}✓ Updated wrangler.toml${NC}"
else
    echo -e "${RED}Error: wrangler.toml not found${NC}"
fi

# Run database migrations
echo ""
echo -e "${BLUE}Running database migrations...${NC}"
cd worker
if wrangler d1 execute clientpulse-db --file=src/db/schema.sql --remote; then
    echo -e "${GREEN}✓ Database schema applied${NC}"
else
    echo -e "${YELLOW}⚠ Migration may have partially failed - check output above${NC}"
fi
cd ..

# Display next steps
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Setup Complete!                                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Set your secrets:"
echo -e "   ${BLUE}cd worker${NC}"
echo -e "   ${BLUE}wrangler secret put STRIPE_SECRET_KEY${NC}"
echo -e "   ${BLUE}wrangler secret put STRIPE_WEBHOOK_SECRET${NC}"
echo -e "   ${BLUE}wrangler secret put GEMINI_API_KEY${NC}"
echo -e "   ${BLUE}wrangler secret put SESSION_SECRET${NC}"
echo ""
echo "2. Configure Stripe:"
echo "   - Create products/prices in Stripe Dashboard"
echo "   - Update price IDs in shared/billing.ts"
echo "   - Set up webhook endpoint: https://your-worker.workers.dev/api/webhooks/stripe"
echo ""
echo "3. Deploy:"
echo -e "   ${BLUE}./scripts/deploy.sh${NC}"
echo ""
echo -e "${BLUE}Resource Summary:${NC}"
echo "  D1 Database ID: $D1_ID"
echo "  KV Namespace ID: $KV_ID"
echo "  Queue: ai-processing-queue"
