#!/bin/bash
# Test script for MultiUserClaw deployment
# Tests both dedicated and shared user modes

set -e

echo "======================================"
echo "MultiUserClaw Testing Script"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE
BASE_URL="${BASE_URL:-http://localhost:8080}"
if [ "$BASE_URL" == "http://localhost:8080" ]; then
    echo -e "${YELLOW}Using default URL: $BASE_URL${NC}"
    echo "To use a different URL, run: BASE_URL=http://your-domain.com $0"
    echo ""
fi

# Test data
DEDICATED_USER="test_dedicated_$(date +%s)"
DEDICATED_EMAIL="${DEDICATED_USER}@example.com"
DEDICATED_PASSWORD="Test123456"

SHARED_USER="test_shared_$(date +%s)"
SHARED_EMAIL="${SHARED_USER}@example.com"
SHARED_PASSWORD="Test123456"

echo -e "${BLUE}Testing configuration:${NC}"
echo "Base URL: $BASE_URL"
echo "Dedicated user: $DEDICATED_USER"
echo "Shared user: $SHARED_USER"
echo ""

# Function to test registration
test_registration() {
    local username=$1
    local email=$2
    local password=$3
    local runtime_mode=$4

    echo -e "${YELLOW}Registering $runtime_mode user...${NC}"

    RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"$username\",
            \"email\": \"$email\",
            \"password\": \"$password\",
            \"runtime_mode\": \"$runtime_mode\"
        }")

    # Check if registration was successful
    if echo "$RESPONSE" | grep -q '"id"'; then
        echo -e "${GREEN}✅ $runtime_mode user registered successfully${NC}"
        USER_ID=$(echo "$RESPONSE" | jq -r '.id')
        echo "   User ID: $USER_ID"
        return 0
    else
        echo -e "${RED}❌ $runtime_mode user registration failed${NC}"
        echo "   Response: $RESPONSE"
        return 1
    fi
}

# Function to test login
test_login() {
    local username=$1
    local password=$2

    echo -e "${YELLOW}Logging in as $username...${NC}"

    RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"username\": \"$username\",
            \"password\": \"$password\"
        }")

    # Check if login was successful
    if echo "$RESPONSE" | grep -q '"access_token"'; then
        TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
        echo -e "${GREEN}✅ Login successful${NC}"
        echo "   Token obtained (first 20 chars): ${TOKEN:0:20}..."
        echo "$TOKEN"
        return 0
    else
        echo -e "${RED}❌ Login failed${NC}"
        echo "   Response: $RESPONSE"
        return 1
    fi
}

# Function to test file upload (dedicated mode)
test_dedicated_upload() {
    local token=$1

    echo -e "${YELLOW}Testing dedicated mode file upload...${NC}"

    # Create test file
    echo "Test file content - $(date)" > /tmp/test_dedicated.txt

    RESPONSE=$(curl -s -X POST "$BASE_URL/api/openclaw/filemanager/upload" \
        -H "Authorization: Bearer $token" \
        -F "file=@/tmp/test_dedicated.txt" \
        -F "path=uploads")

    # Check if upload was successful
    if echo "$RESPONSE" | grep -q '"path"'; then
        PATH=$(echo "$RESPONSE" | jq -r '.path')
        echo -e "${GREEN}✅ Dedicated upload successful${NC}"
        echo "   File path: $PATH"
        return 0
    else
        echo -e "${RED}❌ Dedicated upload failed${NC}"
        echo "   Response: $RESPONSE"
        return 1
    fi
}

# Function to test file upload (shared mode)
test_shared_upload() {
    local token=$1

    echo -e "${YELLOW}Testing shared mode file upload...${NC}"

    # Create test file
    echo "Test file content - $(date)" > /tmp/test_shared.txt

    RESPONSE=$(curl -s -X POST "$BASE_URL/api/shared-openclaw/files/upload" \
        -H "Authorization: Bearer $token" \
        -F "file=@/tmp/test_shared.txt")

    # Check if upload was successful
    if echo "$RESPONSE" | grep -q '"name"'; then
        NAME=$(echo "$RESPONSE" | jq -r '.name')
        PATH=$(echo "$RESPONSE" | jq -r '.path')
        echo -e "${GREEN}✅ Shared upload successful${NC}"
        echo "   File name: $NAME"
        echo "   File path: $PATH"
        return 0
    else
        echo -e "${RED}❌ Shared upload failed${NC}"
        echo "   Response: $RESPONSE"
        return 1
    fi
}

# Function to get user info
get_user_info() {
    local token=$1
    local description=$2

    echo -e "${YELLOW}Getting $description user info...${NC}"

    RESPONSE=$(curl -s -X GET "$BASE_URL/api/auth/me" \
        -H "Authorization: Bearer $token")

    if echo "$RESPONSE" | grep -q '"runtime_mode"'; then
        RUNTIME_MODE=$(echo "$RESPONSE" | jq -r '.runtime_mode')
        echo -e "${GREEN}✅ User info obtained${NC}"
        echo "   Runtime mode: $RUNTIME_MODE"
        return 0
    else
        echo -e "${RED}❌ Failed to get user info${NC}"
        return 1
    fi
}

# Main execution
echo -e "${BLUE}======================================"
echo "Starting Tests"
echo "======================================${NC}"
echo ""

# Test 1: Register dedicated user
echo -e "${BLUE}Test 1: Register dedicated user${NC}"
if test_registration "$DEDICATED_USER" "$DEDICATED_EMAIL" "$DEDICATED_PASSWORD" "dedicated"; then
    echo ""
else
    echo -e "${RED}❌ Failed to register dedicated user, stopping tests${NC}"
    exit 1
fi

# Test 2: Register shared user
echo -e "${BLUE}Test 2: Register shared user${NC}"
if test_registration "$SHARED_USER" "$SHARED_EMAIL" "$SHARED_PASSWORD" "shared"; then
    echo ""
else
    echo -e "${RED}❌ Failed to register shared user, stopping tests${NC}"
    exit 1
fi

# Test 3: Login dedicated user
echo -e "${BLUE}Test 3: Login dedicated user${NC}"
if test_login "$DEDICATED_USER" "$DEDICATED_PASSWORD"; then
    DEDICATED_TOKEN=$TOKEN
    echo ""
else
    echo -e "${RED}❌ Failed to login dedicated user, stopping tests${NC}"
    exit 1
fi

# Test 4: Login shared user
echo -e "${BLUE}Test 4: Login shared user${NC}"
if test_login "$SHARED_USER" "$SHARED_PASSWORD"; then
    SHARED_TOKEN=$TOKEN
    echo ""
else
    echo -e "${RED}❌ Failed to login shared user, stopping tests${NC}"
    exit 1
fi

# Test 5: Get dedicated user info
echo -e "${BLUE}Test 5: Get dedicated user info${NC}"
if get_user_info "$DEDICATED_TOKEN" "dedicated"; then
    echo ""
else
    echo -e "${RED}❌ Failed to get dedicated user info, stopping tests${NC}"
    exit 1
fi

# Test 6: Get shared user info
echo -e "${BLUE}Test 6: Get shared user info${NC}"
if get_user_info "$SHARED_TOKEN" "shared"; then
    echo ""
else
    echo -e "${RED}❌ Failed to get shared user info, stopping tests${NC}"
    exit 1
fi

# Test 7: Dedicated file upload
echo -e "${BLUE}Test 7: Dedicated file upload${NC}"
if test_dedicated_upload "$DEDICATED_TOKEN"; then
    echo ""
else
    echo -e "${YELLOW}⚠️  Dedicated upload test failed, continuing...${NC}"
fi

# Test 8: Shared file upload
echo -e "${BLUE}Test 8: Shared file upload${NC}"
if test_shared_upload "$SHARED_TOKEN"; then
    echo ""
else
    echo -e "${YELLOW}⚠️  Shared upload test failed${ continuing...${NC}"
fi

# Summary
echo -e "${BLUE}======================================"
echo "Test Summary"
echo "======================================${NC}"
echo ""
echo "Test users created:"
echo -e "  Dedicated: ${GREEN}$DEDICATED_USER${NC}"
echo -e "  Shared:     ${GREEN}$SHARED_USER${NC}"
echo ""
echo "You can now:"
echo "  1. Access the frontend at: $BASE_URL/api/../"
echo "  2. Login with the test users above"
echo "  3. Try file uploads through the UI"
echo ""
