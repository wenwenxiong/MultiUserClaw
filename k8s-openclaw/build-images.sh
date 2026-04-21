#!/bin/bash
# Build all Docker images for MultiUserClaw K3s deployment
# Run this script on the K3s node

set -e

echo "======================================"
echo "MultiUserClaw Image Build Script"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker not found. Please install docker first.${NC}"
    exit 1
fi

# Check if project directory exists
if [ ! -d "../platform" ] || [ ! -d "../openclaw" ] || [ ! -d "../frontend" ]; then
    echo -e "${RED}Error: MultiUserClaw project structure not found.${NC}"
    echo "Please run this script from k8s-openclaw directory."
    exit 1
fi

echo -e "${YELLOW}Building Platform Gateway image...${NC}"
cd ../platform
docker build -t openclaw-gateway:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Platform Gateway image built successfully${NC}"
else
    echo -e "${RED}❌ Platform Gateway image build failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Building OpenClaw user image...${NC}"
cd ../openclaw

# Build bridge code
echo "Building bridge code..."
# Install bridge dependencies
cd bridge
if [ ! -d "node_modules" ]; then
    npm install --production=false
fi
cd ..

# Build using npx tsc with tsconfig.bridge.json from openclaw root
# This matches how Dockerfile.bridge builds the project
# Increase Node.js memory limit to prevent OOM errors
NODE_OPTIONS="--max-old-space-size=4096" npx tsc -p tsconfig.bridge.json

# Build Docker image
echo "Building Docker image..."
docker build -f Dockerfile.bridge -t openclaw-user:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ OpenClaw user image built successfully${NC}"
else
    echo -e "${RED}❌ OpenClaw user image build failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Building Frontend image...${NC}"
cd ../frontend

# Build frontend
echo "Installing frontend dependencies and building..."
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build

# Build Docker image
echo "Building Docker image..."
docker build -t openclaw-frontend:latest .
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend image built successfully${NC}"
else
    echo -e "${RED}❌ Frontend image build failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}All images built successfully!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Show built images
echo "Built images:"
docker images | grep openclaw
echo ""

# Instructions for importing to K3s
echo -e "${YELLOW}Next steps: Import these images to K3s containerd${NC}"
echo ""
echo "1. Import Platform Gateway:"
echo -e "   ${GREEN}docker save openclaw-gateway:latest | sudo k3s ctr images import -${NC}"
echo ""
echo "2. Import OpenClaw user:"
echo -e "   ${GREEN}docker save openclaw-user:latest | sudo k3s ctr images import -${NC}"
echo ""
echo "3. Import Frontend:"
echo -e "   ${GREEN}docker save openclaw-frontend:latest | sudo k3s ctr images import -${NC}"
echo ""

echo "Or import all at once:"
echo -e "${YELLOW}docker save openclaw-gateway:latest openclaw-user:latest openclaw-frontend:latest | sudo k3s ctr images import -${NC}"
echo ""
