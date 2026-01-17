#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Full Deployment Script
# Deploys both worker and frontend
# ═══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

ENVIRONMENT=${1:-production}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         ClientPulse - Full Deployment                     ║"
echo "║         Environment: $ENVIRONMENT                              ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

START_TIME=$(date +%s)

# Deploy Worker
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                    Deploying Worker                        ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
"$SCRIPT_DIR/deploy-worker.sh" "$ENVIRONMENT"

# Deploy Frontend
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                   Deploying Frontend                       ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
"$SCRIPT_DIR/deploy-frontend.sh" "$ENVIRONMENT"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║          🚀 Full Deployment Complete! 🚀                  ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Deployment took ${BLUE}${DURATION}s${NC}"
echo ""
echo -e "${YELLOW}Don't forget to:${NC}"
echo "  1. Verify the Stripe webhook is configured"
echo "  2. Test the magic link authentication flow"
echo "  3. Check the AI queue is processing"
echo ""
echo -e "${GREEN}Happy client managing! 🎉${NC}"
