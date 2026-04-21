#!/bin/bash
# Cleanup script for MultiUserClaw deployment
# Use with caution! This will delete all resources

set -e

echo "======================================"
echo "MultiUserClaw Cleanup Script"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Safety confirmation
echo -e "${RED}⚠️  WARNING: This will delete all MultiUserClaw resources!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

NAMESPACE="openclaw-system"

# Delete resources in reverse order
echo "Deleting Ingress..."
kubectl delete -f 09-ingress.yaml

echo "Deleting Dedicated Users StatefulSet..."
kubectl delete -f 08-dedicated-users.yaml

echo "Deleting Frontend..."
kubectl delete -f 07-frontend.yaml

echo "Deleting Shared OpenClaw..."
kubectl delete -f 06-shared-openclaw.yaml

echo "Deleting Platform Gateway..."
kubectl delete -f 05-platform-gateway.yaml

echo "Deleting PostgreSQL..."
kubectl delete -f 04-postgres.yaml

echo "Deleting Secret..."
kubectl delete -f 03-secret.yaml

echo "Deleting ConfigMap..."
kubectl delete -f 02-configmap.yaml

echo "Deleting Namespace..."
kubectl delete -f 01-namespace.yaml

echo ""
echo -e "${YELLOW}⏳ Waiting for resources to be deleted...${NC}"
sleep 10

# Check if namespace is gone
if kubectl get namespace $NAMESPACE &> /dev/null 2>&1; then
    echo -e "${RED}❌ Namespace still exists. You may need to manually delete it.${NC}"
    kubectl get namespace $NAMESPACE
else
    echo -e "${GREEN}✅ All resources deleted successfully.${NC}"
fi

echo ""
echo "Note: Data in /var/lib/openclaw/ is preserved."
echo "To completely remove data, run:"
echo -e "${YELLOW}sudo rm -rf /var/lib/openclaw${NC}"
echo ""
