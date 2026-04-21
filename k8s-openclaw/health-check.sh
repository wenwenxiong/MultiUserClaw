#!/bin/bash
# Health check script for MultiUserClaw deployment

set -e

echo "======================================"
echo "MultiUserClaw Deployment Health Check"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

NAMESPACE="openclaw-system"

# Function to check pod status
check_pods() {
    echo -e "${BLUE}Checking Pod Status...${NC}"
    kubectl get pods -n $NAMESPACE

    RUNNING=$(kubectl get pods -n $NAMESPACE -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' | wc -l)
    TOTAL=$(kubectl get pods -n $NAMESPACE -o jsonpath='{.items}' | jq '. | length')

    if [ "$RUNNING" -eq "$TOTAL" ]; then
        echo -e "${GREEN}✅ All pods are running ($RUNNING/$TOTAL)${NC}"
    else
        echo -e "${RED}❌ Some pods are not running ($RUNNING/$TOTAL)${NC}"
        echo ""
        kubectl get pods -n $NAMESPACE -o wide
        return 1
    fi
    echo ""
}

# Function to check services
check_services() {
    echo -e "${BLUE}Checking Services...${NC}"
    kubectl get svc -n $NAMESPACE
    echo ""

    for svc in postgres-service platform-gateway-service shared-openclaw-service frontend-service; do
        ENDPOINTS=$(kubectl get endpoints $svc -n $NAMESPACE -o jsonpath='{.subsets[*].addresses[*].ip}')
        if [ -n "$ENDPOINTS" ]; then
            echo -e "${RED}❌ $svc has no endpoints${NC}"
        else
            echo -e "${GREEN}✅ $svc has endpoints${NC}"
        fi
    done
    echo ""
}

# Function to check ingress
check_ingress() {
    echo -e "${BLUE}Checking Ingress...${NC}"
    kubectl get ingress -n $NAMESPACE
    echo ""

    ADDRESS=$(kubectl get ingress openclaw-ingress -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    if [ -z "$ADDRESS" ] || [ "$ADDRESS" == "<none>" ]; then
        echo -e "${YELLOW}⚠️  Ingress address not set${NC}"
    else
        echo -e "${GREEN}✅ Ingress address: $ADDRESS${NC}"
    fi
    echo ""
}

# Function to check resources
check_resources() {
    echo -e "${BLUE}Checking Resource Usage...${NC}"
    kubectl top pods -n $NAMESPACE
    echo ""

    kubectl top nodes
    echo ""
}

# Function to check storage
check_storage() {
    echo -e "${BLUE}Checking Storage...${NC}"
    df -h /var/lib/openclaw
    echo ""

    ls -lh /var/lib/openclaw/
    echo ""
}

# Function to check logs for errors
check_logs() {
    echo -e "${BLUE}Checking Recent Logs for Errors...${NC}"

    # Check gateway logs
    echo "Platform Gateway logs (last 20 lines):"
    kubectl logs -n $NAMESPACE -l app=platform-gateway --tail=20 | grep -i "error\|failed\|exception" || echo "No errors found"
    echo ""

    # Check shared openclaw logs
    echo "Shared OpenClaw logs (last 20 lines):"
    kubectl logs -n $NAMESPACE -l app=shared-openclaw --tail=20 | grep -i "error\|failed\|exception" || echo "No errors found"
    echo ""
}

# Main execution
check_pods
check_services
check_ingress
check_resources
check_storage
check_logs

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Health Check Complete${NC}"
echo -e "${GREEN}======================================${NC}"

# Summary
FAILED=0

if ! check_pods; then FAILED=1; fi

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
else
    echo -e "${RED}❌ Some checks failed. See details above.${NC}"
fi

exit $FAILED
