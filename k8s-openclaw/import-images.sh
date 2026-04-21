#!/bin/bash
# Import Docker images to K3s containerd
# Run this script on K3s node after building images

set -e

echo "======================================"
echo "MultiUserClaw Image Import Script"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if k3s and docker are available
if ! command -v k3s &> /dev/null; then
    echo -e "${RED}Error: k3s command not found. Please install k3s first.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker not found. Please install docker first.${NC}"
    exit 1
fi

echo -e "${YELLOW}Importing images from Docker to K3s containerd...${NC}"
echo ""

# Function to import image
import_image() {
    local image_name=$1
    local description=$2

    echo "Importing $description..."
    if docker save $image_name | sudo k3s ctr images import -; then
        echo -e "${GREEN}✅ $description imported successfully${NC}"
    else
        echo -e "${RED}❌ Failed to import $description${NC}"
        echo "Make sure the image exists in Docker: docker images | grep $image_name"
        return 1
    fi
    echo ""
}

# Import all images
import_image "openclaw-gateway:latest" "Platform Gateway"
import_image "openclaw-user:latest" "OpenClaw user image"
import_image "openclaw-frontend:latest" "Frontend image"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Import completed!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Verify images are imported
echo "Verifying imported images..."
sudo k3s ctr images ls | grep openclaw
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ All images successfully imported to K3s${NC}"
else
    echo -e "${YELLOW}⚠️  Some images may not have been imported${NC}"
    echo "Check with: sudo k3s ctr images ls | grep openclaw"
fi
echo ""

echo "Next step: Run ./deploy.sh to deploy the images"
echo ""
