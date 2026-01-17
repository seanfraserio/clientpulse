#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ClientPulse - Development Script
# Starts both frontend and worker in development mode
# ═══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║         ClientPulse - Development Mode                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if we should use local D1
USE_LOCAL=${1:-local}

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill $WORKER_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

if [ ! -d "worker/node_modules" ]; then
    echo -e "${YELLOW}Installing worker dependencies...${NC}"
    cd worker && npm install && cd ..
fi

# Initialize local D1 if needed
if [ "$USE_LOCAL" = "local" ]; then
    echo -e "${YELLOW}Setting up local D1 database...${NC}"
    cd worker
    if [ ! -f ".wrangler/state/v3/d1/miniflare-D1DatabaseObject" ]; then
        wrangler d1 execute clientpulse-db --file=src/db/schema.sql --local 2>/dev/null || true
    fi
    cd ..
    echo -e "${GREEN}✓ Local D1 ready${NC}"
fi

echo ""
echo -e "${BLUE}Starting development servers...${NC}"
echo ""

# Start worker in background
echo -e "${YELLOW}Starting Worker (port 8787)...${NC}"
cd worker
if [ "$USE_LOCAL" = "local" ]; then
    wrangler dev --local --port 8787 &
else
    wrangler dev --port 8787 &
fi
WORKER_PID=$!
cd ..

# Wait for worker to start
sleep 3

# Start frontend
echo -e "${YELLOW}Starting Frontend (port 4321)...${NC}"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Development Servers Running                  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Frontend:  ${BLUE}http://localhost:4321${NC}"
echo -e "  Worker:    ${BLUE}http://localhost:8787${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
echo ""

# Wait for both processes
wait $WORKER_PID $FRONTEND_PID
