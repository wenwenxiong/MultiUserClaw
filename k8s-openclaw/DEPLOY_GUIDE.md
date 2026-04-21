# MultiUserClaw K3s Deployment Guide

This guide provides step-by-step instructions for deploying MultiUserClaw to a K3s cluster with both Dedicated and Shared OpenClaw modes.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Preparation](#preparation)
4. [Building Docker Images](#building-docker-images)
5. [Importing Images to K3s](#importing-images-to-k3s)
6. [Creating K8s Manifests](#creating-k8s-manifests)
7. [Deploying to K3s](#deploying-to-k3s)
8. [Configuration](#configuration)
9. [Verification](#verification)
10. [Troubleshooting](#troubleshooting)
11. [Post-Deployment](#post-deployment)

---

## Prerequisites

### Hardware Requirements

- **Minimum**:
  - 1 CPU core
  - 2GB RAM
  - 20GB disk space

- **Recommended**:
  - 2 CPU cores
  - 4GB RAM
  - 50GB disk space

### Software Requirements

- **K3s Cluster**: Single-node or multi-node cluster
- **Docker**: Installed on K3s node(s)
- **kubectl**: Configured and connected to K3s cluster
- **Domain**: A registered domain name with DNS configuration capability

### LLM Provider Requirements

At least one of the following API keys:
- Anthropic API Key (Claude models)
- OpenAI API Key (GPT models)
- DashScope API Key (Qwen models)
- DeepSeek API Key
- Or any other supported LLM provider

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     K3s Cluster                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             openclaw-system Namespace          │   │
│  │                                                │   │
│  │  ┌─────────────────────────────────────┐        │   │
│  │  │  platform-gateway                 │        │   │
│  │  │  (FastAPI :8080)               │        │   │
│  │  └─────────────────────────────────────┘        │   │
│  │           │                    │                   │   │
│  │  ┌────────────┐      ┌────────────┐      │   │
│  │  │ Dedicated  │      │   Shared   │      │   │
│  │  │  Pods      │      │   Pod      │      │   │
│  │  │  (StatefulSet)│   │            │      │   │
│  │  └────────────┘      └────────────┘      │   │
│  │          │                   │             │   │
│  │  ┌─────────────────────────────┐        │   │
│  │  │    postgres                 │        │   │
│  │  │    (PostgreSQL :5432)      │        │   │
│  │  └─────────────────────────────┘        │   │
│  │          │                               │   │
│  │  ┌─────────────────────────────┐        │   │
│  │  │    frontend                │        │   │
│  │  │    (React :3000)           │        │   │
│  │  └─────────────────────────────┘        │   │
│  └─────────────────────────────────────────────┘   │
│           │                                       │
│  ┌─────────────────────────────────────────┐        │
│  │         Traefik Ingress              │        │
│  │    (TLS Termination)               │        │
│  └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
                      │
              Public Internet
```

### User Modes

#### Dedicated Mode
- Each user gets their own OpenClaw container
- Complete isolation of data and resources
- Supports file uploads, custom skills, and all features
- Resource intensive: 512MB RAM per user

#### Shared Mode
- Multiple users share a single OpenClaw container
- Agent-level isolation via unique agent IDs
- Lightweight: 200MB RAM shared among all users
- Suitable for API-only scenarios without file uploads

---

## Preparation

### 1. Clone the Repository

```bash
# SSH to your K3s node
ssh user@your-k3s-node

# Clone the repository
git clone https://github.com/openclaw/MultiUserClaw.git
cd MultiUserClaw
```

### 2. Create Required Directories

```bash
# Create data directories
sudo mkdir -p /var/lib/openclaw/{postgres,shared,users}
sudo chmod -R 755 /var/lib/openclaw

# Verify directories
ls -la /var/lib/openclaw/
# Expected output:
# drwxr-xr-x 2 root root 4096 Oct 20 10:00 postgres
# drwxr-xr-x 2 root root 4096 Oct 20 10:00 shared
# drwxr-xr-x 2 root root 4096 Oct 20 10:00 users
```

### 3. Verify Docker and K3s

```bash
# Check Docker installation
docker --version
sudo systemctl status docker

# Check K3s status
sudo systemctl status k3s
kubectl get nodes
kubectl version

# Expected output:
# NAME          STATUS   ROLES           AGE   VERSION
# k3s-master    Ready    control-plane,master   10d    v1.29.5+k3s1
```

### 4. Check Available Resources

```bash
# Check CPU and memory
kubectl top nodes

# Check disk space
df -h /var/lib

# Ensure at least 20GB available space
```

---

## Building Docker Images

All images must be built on the K3s node (or transferred to it).

### 1. Build Platform Gateway Image

```bash
# Navigate to platform directory
cd MultiUserClaw/platform

# Build the Docker image
docker build -t openclaw-gateway:latest .

# Verify the image was built
docker images | grep openclaw-gateway

# Expected output:
# REPOSITORY              TAG       IMAGE ID       CREATED        SIZE
# openclaw-gateway        latest    abc123def456   2 minutes ago  1.2GB
```

**Troubleshooting**:
- If `ERROR: Could not find a match for argument` → Check if Dockerfile exists in platform directory
- If `failed to solve frontend dependencies` → Check network connection, consider using Chinese mirror sources

### 2. Build OpenClaw User Image

```bash
# Navigate to openclaw directory
cd MultiUserClaw/openclaw

# Build bridge code
cd bridge
npm install
npm run build
# Or use: npx tsx build

# Navigate back to openclaw root
cd ..

# Build the user image
docker build -f Dockerfile.bridge -t openclaw-user:latest .

# Verify the image
docker images | grep openclaw-user

# Expected output:
# REPOSITORY           TAG       IMAGE ID       CREATED        SIZE
# openclaw-user        latest    ghi789jkl012   3 minutes ago  2.5GB
```

**Troubleshooting**:
- If `node: command not found` → Install Node.js:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  ```
- If `pnpm: command not found` → Install pnpm:
  ```bash
  npm install -g pnpm
  ```
- If build takes too long → Use `--no-cache` parameter to speed up builds

### 3. Build Frontend Image

```bash
# Navigate to frontend directory
cd MultiUserClaw/frontend

# Install dependencies
npm install

# Build production version
npm run build

# Build Docker image
docker build -t openclaw-frontend:latest .

# Verify the image
docker images | grep openclaw-frontend

# Expected output:
# REPOSITORY              TAG       IMAGE ID       CREATED        SIZE
# openclaw-frontend       latest    mno345pqr678   1 minute ago  150MB
```

**Troubleshooting**:
- If `VITE_API_URL` is undefined → Check .env file or set environment variable during build
- If out of memory → Temporarily add swap:
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  ```

---

## Importing Images to K3s

Images must be imported into K3s containerd runtime.

### 1. Import All Images

```bash
# Import Platform Gateway image
docker save openclaw-gateway:latest | sudo k3s ctr images import -

# Import OpenClaw user image
docker save openclaw-user:latest | sudo k3s ctr images import -

# Import Frontend image
docker save openclaw-frontend:latest | sudo k3s ctr images import -

# Verify all images are imported
sudo k3s ctr images ls | grep openclaw

# Expected output:
# docker.io/library/openclaw-gateway:latest
# docker.io/library/openclaw-user:latest
# docker.io/library/openclaw-frontend:latest
```

**Troubleshooting**:
- If `error during import` → Check if Docker images were built successfully
- If `no space left on device` → Clean up old Docker images:
  ```bash
  docker system prune -a
  sudo k3s ctr images prune
  ```

---

## Creating K8s Manifests

### 1. Create Deployment Directory

```bash
# Create manifests directory
mkdir -p ~/k8s-openclaw
cd ~/k8s-openclaw

# The directory structure should be:
# k8s-openclaw/
# ├── 01-namespace.yaml
# ├── 02-configmap.yaml
# ├── 03-secret.yaml
# ├── 04-postgres.yaml
# ├── 05-platform-gateway.yaml
# ├── 06-shared-openclaw.yaml
# ├── 07-frontend.yaml
# ├── 08-dedicated-users.yaml
# └── 09-ingress.yaml
```

### 2. Copy Manifest Files

The YAML files have been created in `k8s-openclaw/` directory. Copy them to your K3s node:

```bash
# From your local machine:
scp -r k8s-openclaw/* user@k3s-node:~/k8s-openclaw/

# Or if files are already on K3s node, ensure they're in ~/k8s-openclaw/
```

### 3. Modify Configuration Files

#### Edit 03-secret.yaml

You MUST replace sensitive values:

```bash
cd ~/k8s-openclaw
vim 03-secret.yaml
# Or use: nano 03-secret.yaml
```

Required changes:
- `JWT_SECRET`: Change to a random string (minimum 32 characters)
- `ADMIN_PASSWORD`: Change to a strong password
- `ANTHROPIC_API_KEY`: Fill in your actual Anthropic API key
- `OPENAI_API_KEY`: Fill in your actual OpenAI API key
- `DASHSCOPE_API_KEY`: Fill in your actual DashScope API key
- `DEEPSEEK_API_KEY`: Fill in your actual DeepSeek API key
- `OPENROUTER_API_KEY`: Fill in your actual OpenRouter API key

#### Edit 09-ingress.yaml

Replace the domain name:

```bash
vim 09-ingress.yaml
```

Required change:
- `host: openclaw.yourdomain.com` → Replace with your actual domain

#### Optional Configuration

You can optionally adjust resource limits in:
- `02-configmap.yaml`: Adjust memory/CPU limits
- `05-platform-gateway.yaml`: Adjust gateway resources
- `06-shared-openclaw.yaml`: Adjust shared pod resources
- `07-frontend.yaml`: Adjust frontend resources
- `08-dedicated-users.yaml`: Adjust per-user pod resources

---

## Deploying to K3s

### 1. Apply All Resources

Apply resources in the correct order:

```bash
cd ~/k8s-openclaw

# 1. Create namespace
kubectl apply -f 01-namespace.yaml

# 2. Apply ConfigMap
kubectl apply -f 02-configmap.yaml

# 3. Apply Secret (contains sensitive information)
kubectl apply -f 03-secret.yaml

# 4. Deploy PostgreSQL
kubectl apply -f 04-postgres.yaml

# 5. Deploy Platform Gateway
kubectl apply -f 05-platform-gateway.yaml

# 6. Deploy Shared OpenClaw
kubectl apply -f 06-shared-openclaw.yaml

# 7. Deploy Frontend
kubectl apply -f 07-frontend.yaml

# 8. Deploy Dedicated Users StatefulSet (starts with 0 replicas)
kubectl apply -f 08-dedicated-users.yaml

# 9. Configure Ingress
kubectl apply -f 09-ingress.yaml
```

### 2. Monitor Pod Startup

Watch pods starting up:

```bash
# Real-time monitoring
kubectl get pods -n openclaw-system -w

# Or use watch command for continuous monitoring
watch -n 2 'kubectl get pods -n openclaw-system'
```

Expected status progression:

```
# Initial state (all Pending)
NAME                                 READY   STATUS    RESTARTS   AGE
postgres-xxx                        0/1     Pending   0          0s
platform-gateway-xxx               0/1     Pending   0          0s
shared-openclaw-xxx                 0/1     Pending   0          0s
frontend-xxx                        0/1     Pending   0          0s

# After a few minutes (some Running)
postgres-xxx                        1/1     Running   0          30s
platform-gateway-xxx               0/1     ContainerCreating   0          45s
shared-openclaw-xxx                 1/1     Running   0          40s
frontend-xxx                        0/1     ImagePullBackOff   0          60s

# Final state (all Running)
postgres-xxx                        1/1     Running   0          2m
platform-gateway-xxx               1/1     Running   0          2m30s
shared-openclaw-xxx                 1/1     Running   0          2m15s
frontend-xxx                        1/1     Running   0          3m10s
```

Wait until all pods show `Running` status with `1/1` in the READY column.

---

## Configuration

### 1. Configure DNS Resolution

#### Get K3s Node IP

```bash
kubectl get nodes -o wide

# Expected output:
# NAME          STATUS   ROLES           AGE   VERSION   INTERNAL-IP    EXTERNAL-IP
# k3s-master    Ready    control-plane,master   10d    v1.29.5+k3s1   192.168.1.100   <none>
```

#### Configure DNS A Record

In your domain provider's control panel:
- **Record Type**: A
- **Host/Name**: openclaw (or @)
- **Value/Points to**: 192.168.1.100 (replace with actual IP)
- **TTL**: 600 (or default)

#### Verify DNS Resolution

Wait 5-10 minutes for DNS to propagate, then verify:

```bash
nslookup openclaw.yourdomain.com
ping openclaw.yourdomain.com
```

### 2. Configure Let's Encrypt (Optional)

If you want automatic HTTPS:

```bash
# Ensure Traefik has access to port 80/443
kubectl get svc -n kube-system

# Configure Let's Encrypt
kubectl edit ingress openclaw-ingress -n openclaw-system
```

Add or modify these annotations:
```yaml
annotations:
  traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
  cert-manager.io/cluster-issuer: letsencrypt-prod  # If using cert-manager
```

---

## Verification

### 1. Check All Resources

```bash
# 1. Check Pod status
kubectl get pods -n openclaw-system

# Expected: All pods should show: 1/1 Running

# 2. Check Service status
kubectl get svc -n openclaw-system

# Expected: Should see 4 services
# - postgres-service
# - platform-gateway-service
# - shared-openclaw-service
# - frontend-service

# 3. Check Ingress status
kubectl get ingress -n openclaw-system

# Expected: Should show ADDRESS with IP or domain

# 4. Check Endpoints
kubectl get endpoints -n openclaw-system

# Expected: Each service should have corresponding endpoints
```

### 2. Check Logs

```bash
# 1. Platform Gateway logs
kubectl logs -n openclaw-system -l app=platform-gateway --tail=100 -f

# 2. Shared OpenClaw logs
kubectl logs -n openclaw-system -l app=shared-openclaw --tail=100 -f

# 3. PostgreSQL logs
kubectl logs -n openclaw-system -l app=postgres --tail=50

# 4. Frontend logs
kubectl logs -n openclaw-system -l app=frontend --tail=50
```

### 3. Check Storage Volumes

```bash
# Verify HostPath directories are created
ls -la /var/lib/openclaw/
# Expected: postgres/ shared/ users/

# Check directory permissions
ls -ld /var/lib/openclaw/*
```

### 4. Test Network Connectivity

```bash
# 1. Test Gateway API
curl -I http://openclaw.yourdomain.com/api
# Expected: HTTP/1.1 200 OK or HTTP/1.1 404 Not Found (normal)

# 2. Test Frontend
curl -I http://openclaw.yourdomain.com/
# Expected: HTTP/1.1 200 OK

# 3. Test Dedicated path
curl -I http://openclaw.yourdomain.com/api/openclaw

# 4. Test Shared path
curl -I http://openclaw.yourdomain.com/api/shared-openclaw
```

### 5. Test User Registration and Login

```bash
# Register Dedicated user
curl -X POST http://openclaw.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_dedicated",
    "email": "test_dedicated@example.com",
    "password": "Test123456",
    "runtime_mode": "dedicated"
  }'

# Expected: {"id":"xxx","username":"test_dedicated","email":"test_dedicated@example.com","runtime_mode":"dedicated",...}

# Login and get token
TOKEN=$(curl -s -X POST http://openclaw.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_dedicated",
    "password": "Test123456"
  }' | jq -r '.access_token')

# Register Shared user
curl -X POST http://openclaw.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_shared",
    "email": "test_shared@example.com",
    "password": "Test123456",
    "runtime_mode": "shared"
  }'

# Expected: {"id":"yyy","username":"test_shared","email":"test_shared@example.com","runtime_mode":"shared",...}

# Login and get token
SHARED_TOKEN=$(curl -s -X POST http://openclaw.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_shared",
    "password": "Test123456"
  }' | jq -r '.access_token')
```

### 6. Test File Upload

```bash
# Test Dedicated mode file upload
echo "test file content" > test.txt
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt" \
  -F "path=uploads" \
  http://openclaw.yourdomain.com/api/openclaw/filemanager/upload

# Expected: {"path":"workspace-main/uploads/test.txt","name":"test.txt",...}

# Test Shared mode file upload
curl -X POST \
  -H "Authorization: Bearer $SHARED_TOKEN" \
  -F "file=@test.txt" \
  http://openclaw.yourdomain.com/api/shared-openclaw/files/upload

# Expected: {"name":"test.txt","path":"workspace-usr_xxx/uploads/test.txt",...}
```

### 7. Access Frontend

Open your browser and navigate to:
- http://openclaw.yourdomain.com (or https:// if TLS is configured)

Test login with:
- Dedicated user: `test_dedicated` / `Test123456`
- Shared user: `test_shared` / `Test123456`

---

## Troubleshooting

### Issue 1: Pods Stuck in Pending State

```bash
# Diagnose the issue
kubectl describe pod <pod-name> -n openclaw-system

# Common causes and solutions:

# 1. Insufficient resources
# Check: kubectl describe nodes
# Solution: Increase node resources or adjust Pod resource limits
kubectl edit deployment platform-gateway -n openclaw-system

# 2. Image not found
# Check: sudo k3s ctr images ls | grep openclaw
# Solution: Re-import the missing image

# 3. HostPath directory permission issues
# Check: ls -ld /var/lib/openclaw
# Solution: sudo chmod 755 /var/lib/openclaw
```

### Issue 2: Pods Failing (CrashLoopBackOff)

```bash
# Check pod logs
kubectl logs <pod-name> -n openclaw-system --previous

# Common causes:

# 1. Configuration errors
# Check: kubectl get configmap openclaw-config -n openclaw-system -o yaml
# Check: kubectl get secret openclaw-secrets -n openclaw-system -o yaml
# Solution: Fix configuration values

# 2. Database connection failure
# Check: DATABASE_URL in secret
# Verify: kubectl logs -n openclaw-system -l app=postgres
# Solution: Ensure postgres pod is running

# 3. Insufficient memory
# Check: kubectl describe pod <pod-name> -n openclaw-system
# Solution: Increase memory limits in deployment manifest
```

### Issue 3: Ingress 502/504 Errors

```bash
# Diagnose the issue
kubectl describe ingress openclaw-ingress -n openclaw-system
kubectl get endpoints -n openclaw-system

# Common causes:

# 1. Service has no endpoints
# Check: kubectl get pods -n openclaw-system
# Solution: Ensure backend pods are running

# 2. Timeout configuration too short
# Check: kubectl describe ingress openclaw-ingress -n openclaw-system
# Solution: Increase timeout in annotations
kubectl edit ingress openclaw-ingress -n openclaw-system
# Add: traefik.ingress.kubernetes.io/services.timeouts: "10m"

# 3. DNS resolution errors
# Verify: nslookup openclaw.yourdomain.com
# Verify: ping openclaw.yourdomain.com
# Solution: Fix DNS configuration
```

### Issue 4: File Upload Fails

```bash
# Test network connectivity
curl -v http://openclaw.yourdomain.com/api/openclaw/filemanager/upload \
  -H "Authorization: Bearer test-token"

# Check gateway logs
kubectl logs -n openclaw-system -l app=platform-gateway --tail=100

# Common causes:

# 1. Incorrect path configuration
# Check: kubectl get ingress openclaw-ingress -n openclaw-system -o yaml
# Solution: Verify paths are correct

# 2. Invalid token
# Check: Re-login to get new token
# Solution: Use fresh access token

# 3. Container not ready
# Check: kubectl get pods -n openclaw-system
# Solution: Wait for user pod to start (for dedicated mode)
```

### Issue 5: High Memory Usage

```bash
# Check resource usage
kubectl top pods -n openclaw-system

# Check node resources
kubectl top nodes

# Solutions:
# 1. Adjust resource limits in deployment manifests
kubectl edit deployment platform-gateway -n openclaw-system

# 2. Add swap space
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile

# 3. Remove unused pods
kubectl delete pod <pod-name> -n openclaw-system
```

---

## Post-Deployment

### 1. Configure Monitoring

#### Install Prometheus and Grafana

```bash
# Install kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack -n monitoring

# Access Grafana
kubectl port-forward -n monitoring svc/kube-prometheus-stack-grafana 3000:80

# Login with default credentials (admin/prom-operator)
# Open: http://localhost:3000
```

#### Configure Alerts

Create alert rules for:
- Pod restarts
- High memory usage (>80%)
- High CPU usage (>80%)
- Failed deployments

### 2. Configure Log Collection

#### Install Loki

```bash
# Install Loki
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install loki grafana/loki-stack -n loki

# Configure log aggregation
kubectl logs -n openclaw-system -f | loki
```

### 3. Configure Backups

#### Database Backup

```bash
# Backup PostgreSQL
kubectl exec -n openclaw-system postgres-xxx -- pg_dump -U openclaw openclaw_db > backup_$(date +%Y%m%d).sql

# Schedule daily backups
crontab -e
# Add: 0 2 * * * kubectl exec -n openclaw-system postgres-xxx -- pg_dump -U openclaw openclaw_db > /backup/backup_$(date +\%Y\%m\%d).sql
```

#### Data Directory Backup

```bash
# Backup HostPath data
sudo tar -czf /backup/openclaw-data-$(date +%Y%m%d).tar.gz /var/lib/openclaw/

# Schedule daily backups
crontab -e
# Add: 0 3 * * * sudo tar -czf /backup/openclaw-data-$(date +\%Y\%m\%d).tar.gz /var/lib/openclaw/
```

### 4. Performance Optimization

#### Enable HPA (Horizontal Pod Autoscaler)

```bash
# Install metrics server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Create HPA for shared openclaw
kubectl autoscale deployment shared-openclaw -n openclaw-system --cpu-percent=70 --min=1 --max=3

# Create HPA for platform gateway
kubectl autoscale deployment platform-gateway -n openclaw-system --cpu-percent=70 --min=1 --max=3
```

#### Adjust Resource Limits

Based on actual usage, adjust limits:

```bash
# Edit platform-gateway
kubectl edit deployment platform-gateway -n openclaw-system

# Edit shared-openclaw
kubectl edit deployment shared-openclaw -n openclaw-system

# Edit frontend
kubectl edit deployment frontend -n openclaw-system
```

### 5. Security Hardening

#### Change Default Passwords

```bash
# Update admin password in secret
kubectl patch secret openclaw-secrets -n openclaw-system \
  -p '{"stringData":{"ADMIN_PASSWORD":"YourNewStrongPassword123!"}}'

# Restart gateway to apply changes
kubectl rollout restart deployment platform-gateway -n openclaw-system
```

#### Enable TLS

```bash
# Ensure Traefik is configured for TLS
kubectl edit ingress openclaw-ingress -n openclaw-system

# Add/ensure these annotations:
annotations:
  traefik.ingress.kubernetes.io/router.tls: "true"
  traefik.ingress.kubernetes.io/router.tls.certresolver: letsencrypt
```

#### Configure Network Policies

```bash
# Create network policy to restrict traffic
cat > network-policy.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: openclaw-policy
  namespace: openclaw-system
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: openclaw-system
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 5432
EOF

kubectl apply -f network-policy.yaml
```

---

## Maintenance

### Update Platform Gateway

```bash
# Build new gateway image
cd MultiUserClaw/platform
docker build -t openclaw-gateway:latest .

# Import to K3s
docker save openclaw-gateway:latest | sudo k3s ctr images import -

# Update deployment
kubectl set image deployment/platform-gateway openclaw-gateway=openclaw-gateway:latest -n openclaw-system

# Monitor rollout
kubectl rollout status deployment/platform-gateway -n openclaw-system
```

### Update OpenClaw User Image

```bash
# Build new user image
cd MultiUserClaw/openclaw
docker build -f Dockerfile.bridge -t openclaw-user:latest .

# Import to K3s
docker save openclaw-user:latest | sudo k3s ctr images import -

# Update shared deployment
kubectl set image deployment/shared-openclaw shared-openclaw=openclaw-user:latest -n openclaw-system

# Restart dedicated users (they will use new image on next creation)
# No action needed - new pods will use updated image
```

### Scale Dedicated Users

```bash
# Scale up
kubectl scale statefulset openclaw-users -n openclaw-system --replicas=5

# Scale down
kubectl scale statefulset openclaw-users -n openclaw-system --replicas=0
```

---

## Support and Resources

### Documentation
- MultiUserClaw README: https://github.com/openclaw/MultiUserClaw
- K3s Documentation: https://docs.k3s.io/
- Traefik Ingress: https://doc.traefik.io/traefik/providers/kubernetes-ingress/

### Troubleshooting Commands

```bash
# Quick diagnosis
kubectl get all -n openclaw-system
kubectl describe pod <pod-name> -n openclaw-system
kubectl logs <pod-name> -n openclaw-system --tail=100

# Resource monitoring
kubectl top pods -n openclaw-system
kubectl top nodes

# Service and ingress status
kubectl get svc,ingress -n openclaw-system
kubectl get endpoints -n openclaw-system
```

### Backup and Restore

```bash
# Backup all data
sudo tar -czf openclaw-backup-$(date +%Y%m%d).tar.gz /var/lib/openclaw/

# Restore (if needed)
sudo tar -xzf openclaw-backup-20241020.tar.gz -C /

# Backup database
kubectl exec -n openclaw-system postgres-xxx -- pg_dump -U openclaw openclaw_db > backup.sql

# Restore database
kubectl exec -i -n openclaw-system postgres-xxx -- psql -U openclaw openclaw_db < backup.sql
```

---

## Checklist

### Pre-Deployment Checklist

- [ ] K3s node SSH access available
- [ ] Docker installed and running
- [ ] kubectl configured and connected
- [ ] Domain name registered
- [ ] DNS A record configured
- [ ] At least one LLM API key available
- [ ] Sufficient disk space (minimum 20GB)
- [ ] Project cloned on K3s node

### Build Checklist

- [ ] Platform Gateway image built successfully
- [ ] OpenClaw user image built successfully
- [ ] Frontend image built successfully
- [ ] All images imported to K3s containerd
- [ ] No build errors or warnings

### Deployment Checklist

- [ ] Namespace created
- [ ] ConfigMap applied
- [ ] Secret applied with sensitive values updated
- [ ] PostgreSQL deployed and running
- [ ] Platform Gateway deployed and running
- [ ] Shared OpenClaw deployed and running
- [ ] Frontend deployed and running
- [ ] Dedicated users StatefulSet deployed
- [ ] Ingress configured and accessible

### Verification Checklist

- [ ] All pods in Running state
- [ ] All services have correct endpoints
- [ ] Ingress configured with domain
- [ ] DNS resolution working
- [ ] Frontend accessible via browser
- [ ] Dedicated user registration successful
- [ ] Shared user registration successful
- [ ] Dedicated user file upload working
- [ ] Shared user file upload working
- [ ] Admin login working

### Post-Deployment Checklist

- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Log collection configured (Loki)
- [ ] Backup strategy implemented
- [ ] Alerts configured
- [ ] Security hardening completed
- [ ] Performance optimized

---

## Conclusion

Congratulations! You have successfully deployed MultiUserClaw to your K3s cluster with support for both Dedicated and Shared user modes.

For questions or issues:
1. Check the troubleshooting section
2. Review pod logs: `kubectl logs -n openclaw-system -l app=<app-name>`
3. Check the MultiUserClaw GitHub repository for updates

Happy deploying!
