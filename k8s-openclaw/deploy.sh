#!/bin/bash
# Quick deployment script for MultiUserClaw on K3s
# This script automates the deployment process

set -e

echo "======================================"
echo "MultiUserClaw K3s Deployment Script"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on K3s node
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl not found. Please install kubectl first.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker not found. Please install docker first.${NC}"
    exit 1
fi

# Check namespace
if kubectl get namespace openclaw-system &> /dev/null 2>&1; then
    echo -e "${YELLOW}Namespace openclaw-system already exists. Skipping creation.${NC}"
else
    echo "Creating namespace..."
    kubectl apply -f 01-namespace.yaml
fi

# Apply ConfigMap
echo "Applying ConfigMap..."
kubectl apply -f 02-configmap.yaml

# Apply Secret
echo "Applying Secret..."
kubectl apply -f 03-secret.yaml
echo -e "${YELLOW}⚠️  Remember to update API keys in 03-secret.yaml${NC}"

# Deploy PostgreSQL
echo "Deploying PostgreSQL..."
kubectl apply -f 04-postgres.yaml

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n openclaw-system --timeout=300s

# Deploy Platform Gateway
echo "Deploying Platform Gateway..."
kubectl apply -f 05-platform-gateway.yaml

# Deploy Shared OpenClaw
echo "Deploying Shared OpenClaw..."
kubectl apply -f 06-shared-openclaw.yaml

# Deploy Frontend
echo "Deploying Frontend..."
kubectl apply -f 07-frontend.yaml

# Deploy Dedicated Users StatefulSet
echo "Deploying Dedicated Users StatefulSet..."
kubectl apply -f 08-dedicated-users.yaml

# Configure Ingress
echo "Configuring Ingress..."
kubectl apply -f 09-ingress.yaml
echo -e "${YELLOW}⚠️  Remember to update domain in 09-ingress.yaml${NC}"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check pod status
echo "Checking pod status..."
sleep 5
kubectl get pods -n openclaw-system

echo ""
echo "To monitor pods in real-time, run:"
echo -e "${YELLOW}watch -n 2 'kubectl get pods -n openclaw-system'${NC}"
echo ""

echo "To check logs, run:"
echo "  Platform Gateway: ${YELLOW}kubectl logs -n openclaw-system -l app=platform-gateway -f${NC}"
echo "  Shared OpenClaw:  ${YELLOW}kubectl logs -n openclaw-system -l app=shared-openclaw -f${NC}"
echo "  PostgreSQL:         ${YELLOW}kubectl logs -n openclaw-system -l app=postgres -f${NC}"
echo "  Frontend:          ${YELLOW}kubectl logs -n openclaw-system -l app=frontend -f${NC}"
echo ""

echo "Next steps:"
echo "1. Update DNS A record to point to your K3s node IP"
echo "2. Wait for DNS to propagate (5-10 minutes)"
echo "3. Test access at: http://your-domain.com"
echo "4. Register test users (see DEPLOY_GUIDE.md)"
echo ""
