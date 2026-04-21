# MultiUserClaw K3s Deployment

This directory contains all the necessary Kubernetes manifests and deployment scripts for deploying MultiUserClaw to a K3s cluster.

---

## 📁 Directory Structure

```
k8s-openclaw/
├── 01-namespace.yaml           # Kubernetes namespace
├── 02-configmap.yaml          # Configuration (resource limits, timeouts, etc.)
├── 03-secret.yaml             # Sensitive data (API keys, passwords)
├── 04-postgres.yaml            # PostgreSQL database deployment
├── 05-platform-gateway.yaml   # Platform Gateway (FastAPI backend)
├── 06-shared-openclaw.yaml    # Shared OpenClaw container
├── 07-frontend.yaml            # Frontend UI (React)
├── 08-dedicated-users.yaml    # Dedicated users StatefulSet
├── 09-ingress.yaml             # Traefik Ingress configuration
├── DEPLOY_GUIDE.md           # Comprehensive deployment guide
├── deploy.sh                  # Quick deployment script
├── health-check.sh            # Health check script
├── cleanup.sh                 # Cleanup script
└── README.md                 # This file
```

---

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Copy all files to your K3s node
scp -r k8s-openclaw/* user@k3s-node:~/k8s-openclaw/

# 2. SSH to K3s node
ssh user@k3s-node

# 3. Navigate to deployment directory
cd ~/k8s-openclaw

# 4. Edit configuration files (IMPORTANT!)
vim 03-secret.yaml  # Update API keys and passwords
vim 09-ingress.yaml  # Update domain name

# 5. Run deployment script
./deploy.sh
```

### Option 2: Manual Deployment

Follow the comprehensive guide in `DEPLOY_GUIDE.md` for step-by-step manual deployment instructions.

---

## 📝 Required Modifications

Before deploying, you MUST modify these files:

### 1. Update API Keys in 03-secret.yaml

Edit `03-secret.yaml` and replace placeholder values:

```yaml
stringData:
  # Change this to a strong password
  ADMIN_PASSWORD: "your-strong-password-here"

  # Replace with actual API keys
  ANTHROPIC_API_KEY: "sk-ant-your-actual-key-here"
  OPENAI_API_KEY: "sk-your-actual-key-here"
  DASHSCOPE_API_KEY: "sk-your-actual-key-here"
  DEEPSEEK_API_KEY: "sk-your-actual-key-here"
  OPENROUTER_API_KEY: "sk-or-your-actual-key-here"
```

### 2. Update Domain in 09-ingress.yaml

Edit `09-ingress.yaml` and replace the domain:

```yaml
spec:
  rules:
  - host: openclaw.yourdomain.com  # ← Replace with your domain
```

---

## 🛠️ Scripts

### deploy.sh

Automated deployment script that:
- Creates namespace
- Applies all manifests in correct order
- Waits for PostgreSQL to be ready
- Displays next steps

```bash
./deploy.sh
```

### health-check.sh

Comprehensive health check script that:
- Verifies all pods are running
- Checks service endpoints
- Validates ingress configuration
- Shows resource usage
- Checks storage availability
- Reviews recent logs for errors

```bash
./health-check.sh
```

### cleanup.sh

Cleanup script that:
- Deletes all K8s resources
- Preserves data in `/var/lib/openclaw/`
- Confirms deletion before proceeding

```bash
./cleanup.sh
```

**⚠️ WARNING**: Use cleanup.sh with caution! It will delete all MultiUserClaw resources.

---

## 📊 Resource Requirements

### Minimum Requirements

- **CPU**: 1 core
- **RAM**: 2GB
- **Disk**: 20GB

### Recommended Requirements

- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 50GB

### Per-User Requirements (Dedicated Mode)

- **RAM per user**: 512MB
- **CPU per user**: 500m
- **Disk per user**: ~100MB (for workspace data)

### Shared Mode Requirements

- **RAM**: 200MB (shared among all users)
- **CPU**: 500m (shared among all users)
- **Disk**: ~10MB (for shared workspace)

---

## 🏗️ Architecture Overview

```
Internet
   │
   ▼
┌─────────────────────────────────────────────────────┐
│         Traefik Ingress (K3s)               │
│         - HTTPS termination                     │
│         - Load balancing                       │
└─────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Frontend  │  │   Gateway  │  │   Shared    │
│  (React)   │  │ (FastAPI) │  │   OpenClaw  │
│  :3000     │  │   :8080    │  │   :18080    │
└────────────┘  └────────────┘  └────────────┘
                      │              │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Dedicated │  │  PostgreSQL │  │   HostPath  │
│  Users      │  │  Database   │  │  Storage    │
│  (Dynamic) │  │   :5432    │  │            │
└────────────┘  └────────────┘  └────────────┘
```

---

## 📖 Documentation

For detailed deployment instructions, troubleshooting, and post-deployment tasks, see:

- **Comprehensive Guide**: `DEPLOY_GUIDE.md`
  - Complete step-by-step instructions
  - Building Docker images
  - Importing images to K3s
  - Manual deployment process
  - Verification steps
  - Troubleshooting guide
  - Post-deployment optimization

---

## 🔧 Common Tasks

### Update Platform Gateway

```bash
# 1. Build new image on your local machine
cd ../platform
docker build -t openclaw-gateway:latest .

# 2. Copy to K3s node
docker save openclaw-gateway:latest | ssh user@k3s-node "sudo k3s ctr images import -"

# 3. Update deployment on K3s node
ssh user@k3s-node
cd ~/k8s-openclaw
kubectl set image deployment/platform-gateway openclaw-gateway=openclaw-gateway:latest -n openclaw-system

# 4. Monitor rollout
kubectl rollout status deployment/platform-gateway -n openclaw-system
```

### Scale Dedicated Users

```bash
# Scale up to 5 users
kubectl scale statefulset openclaw-users -n openclaw-system --replicas=5

# Scale down to 0 users
kubectl scale statefulset openclaw-users -n openclaw-system --replicas=0
```

### Check Pod Status

```bash
# List all pods
kubectl get pods -n openclaw-system

# Watch pods in real-time
watch -n 2 'kubectl get pods -n openclaw-system'

# Get detailed pod information
kubectl describe pod <pod-name> -n openclaw-system
```

### View Logs

```bash
# Platform Gateway logs
kubectl logs -n openclaw-system -l app=platform-gateway -f

# Shared OpenClaw logs
kubectl logs -n openclaw-system -l app=shared-openclaw -f

# PostgreSQL logs
kubectl logs -n openclaw-system -l app=postgres

# Frontend logs
kubectl logs -n openclaw-system -l app=frontend -f

# All logs (tail follow)
kubectl logs -n openclaw-system -f --all-containers=true
```

---

## 🧪 Testing

### Test Dedicated Mode

```bash
# Register a dedicated user
curl -X POST http://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_dedicated",
    "email": "test_dedicated@example.com",
    "password": "Test123456",
    "runtime_mode": "dedicated"
  }'

# Login and get token
TOKEN=$(curl -s -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_dedicated",
    "password": "Test123456"
  }' | jq -r '.access_token')

# Test file upload (dedicated path)
echo "test" > test.txt
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt" \
  -F "path=uploads" \
  http://your-domain.com/api/openclaw/filemanager/upload
```

### Test Shared Mode

```bash
# Register a shared user
curl -X POST http://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_shared",
    "email": "test_shared@example.com",
    "password": "Test123456",
    "runtime_mode": "shared"
  }'

# Login and get token
SHARED_TOKEN=$(curl -s -X POST http://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_shared",
    "password": "Test123456"
  }' | jq -r '.access_token')

# Test file upload (shared path)
curl -X POST \
  -H "Authorization: Bearer $SHARED_TOKEN" \
  -F "file=@test.txt" \
  http://your-domain.com/api/shared-openclaw/files/upload
```

---

## ⚠️ Important Notes

### Before Deployment

1. **Update API Keys**: You must update `03-secret.yaml` with your actual LLM API keys
2. **Update Domain**: Replace `openclaw.yourdomain.com` in `09-ingress.yaml` with your actual domain
3. **Check Resources**: Ensure your K3s node has sufficient resources (CPU, RAM, Disk)
4. **Configure DNS**: Add A record pointing to your K3s node IP
5. **Backup Existing**: If you have existing data, back it up before deploying

### During Deployment

1. **Watch Pod Status**: Use `watch -n 2 'kubectl get pods -n openclaw-system'` to monitor startup
2. **Check Logs**: If pods fail, check logs: `kubectl logs <pod-name> -n openclaw-system`
3. **Wait for DNS**: DNS propagation can take 5-10 minutes
4. **Verify Access**: Test frontend and API endpoints after deployment

### After Deployment

1. **Register Test Users**: Create both dedicated and shared test users
2. **Test File Uploads**: Verify both upload endpoints work
3. **Monitor Resources**: Use `health-check.sh` regularly
4. **Configure Backups**: Set up automated backups for PostgreSQL and data
5. **Enable Monitoring**: Consider setting up Prometheus/Grafana

---

## 🔒 Security Considerations

1. **Change Default Passwords**: Update all default passwords before deploying
2. **Use Strong Secrets**: Generate cryptographically strong JWT secrets
3. **Enable TLS**: Configure Let's Encrypt for HTTPS
4. **Network Policies**: Consider implementing network policies to restrict traffic
5. **RBAC**: For production, implement Kubernetes RBAC
6. **API Key Protection**: Never commit API keys to version control
7. **Regular Updates**: Keep images and dependencies updated

---

## 📞 Troubleshooting

### Pod Not Starting

```bash
# Describe the pod
kubectl describe pod <pod-name> -n openclaw-system

# Check events
kubectl get events -n openclaw-system --sort-by='.lastTimestamp'
```

### 502/504 Errors

```bash
# Check ingress configuration
kubectl describe ingress openclaw-ingress -n openclaw-system

# Check service endpoints
kubectl get endpoints -n openclaw-system

# Check pod status
kubectl get pods -n openclaw-system -o wide
```

### High Memory Usage

```bash
# Check memory usage
kubectl top pods -n openclaw-system

# Adjust resource limits
kubectl edit deployment platform-gateway -n openclaw-system
```

For more troubleshooting, see the comprehensive guide in `DEPLOY_GUIDE.md`.

---

## 📞 Support

### Documentation

- MultiUserClaw Project: https://github.com/openclaw/MultiUserClaw
- K3s Documentation: https://docs.k3s.io/
- Traefik Ingress: https://doc.traefik.io/traefik/providers/kubernetes-ingress/

### Issues

For bugs or issues:
1. Check the troubleshooting section in `DEPLOY_GUIDE.md`
2. Review pod logs: `kubectl logs -n openclaw-system`
3. Check the GitHub repository for similar issues
4. Open an issue on GitHub

---

## 📋 Quick Reference

### Useful Commands

```bash
# Get all resources
kubectl get all -n openclaw-system

# Get pod status
kubectl get pods -n openclaw-system

# Get services
kubectl get svc -n openclaw-system

# Get ingress
kubectl get ingress -n openclaw-system

# Get secrets (masked)
kubectl get secrets -n openclaw-system

# Describe a resource
kubectl describe <type> <name> -n openclaw-system

# Edit a resource
kubectl edit <type> <name> -n openclaw-system

# Get logs
kubectl logs <pod-name> -n openclaw-system

# Exec into a pod
kubectl exec -it <pod-name> -n openclaw-system -- /bin/sh

# Port forward
kubectl port-forward svc/<service-name> <local-port>:<service-port> -n openclaw-system

# Scale deployment
kubectl scale deployment <deployment-name> -n openclaw-system --replicas=<number>

# Scale statefulset
kubectl scale statefulset <statefulset-name> -n openclaw-system --replicas=<number>
```

---

## 🎯 Next Steps

1. ✅ Read through this README
2. ✅ Review `DEPLOY_GUIDE.md` for detailed instructions
3. ✅ Modify `03-secret.yaml` with your API keys
4. ✅ Modify `09-ingress.yaml` with your domain
5. ✅ Build Docker images (or transfer to K3s node)
6. ✅ Run `./deploy.sh` or follow manual deployment
7. ✅ Verify deployment with `./health-check.sh`
8. ✅ Configure DNS
9. ✅ Test both dedicated and shared modes
10. ✅ Set up monitoring and backups

Good luck with your deployment! 🚀
