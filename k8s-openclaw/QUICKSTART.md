# MultiUserClaw K3s Quick Start Guide

This guide will help you deploy MultiUserClaw to K3s in the fastest way possible.

---

## 🚀 Quick Start (10 Minutes)

### Step 1: Prepare (2 minutes)

```bash
# 1. Clone or navigate to MultiUserClaw directory
cd /path/to/MultiUserClaw

# 2. Copy k8s-openclaw directory to your K3s node
scp -r k8s-openclaw user@k3s-node:~/
```

### Step 2: SSH to K3s Node (1 minute)

```bash
# SSH to your K3s node
ssh user@k3s-node

# Navigate to deployment directory
cd ~/k8s-openclaw
```

### Step 3: Build Images (3 minutes)

**Option A: Build on K3s node**

```bash
# Run the build script
./build-images.sh
```

**Option B: Build locally and transfer**

```bash
# On your local machine:
cd platform && docker build -t openclaw-gateway:latest .
cd ../openclaw && docker build -f Dockerfile.bridge -t openclaw-user:latest .
cd ../frontend && docker build -t openclaw-frontend:latest .

# Transfer to K3s node:
docker save openclaw-gateway:latest openclaw-user:latest openclaw-frontend:latest | ssh user@k3s-node "k3s ctr images import -"
```

### Step 4: Import Images to K3s (1 minute)

```bash
# Run the import script
./import-images.sh
```

### Step 5: Configure (3 minutes)

```bash
# IMPORTANT: You MUST update these files!

# 1. Update API keys in secret file
vim 03-secret.yaml

# Change these values:
# - ADMIN_PASSWORD: "your-strong-password"
# - ANTHROPIC_API_KEY: "sk-ant-your-actual-key"
# - OPENAI_API_KEY: "sk-openai-your-actual-key"
# - DASHSCOPE_API_KEY: "sk-dashscope-your-actual-key"
# - (Add other API keys as needed)

# 2. Update domain in ingress file
vim 09-ingress.yaml

# Change this line:
# host: openclaw.yourdomain.com  # Replace with your actual domain
```

### Step 6: Deploy (1 minute)

```bash
# Run the deployment script
./deploy.sh

# Watch pods start up
watch -n 2 'kubectl get pods -n openclaw-system'

# Wait until all pods show "Running" status
```

### Step 7: Configure DNS (5-10 minutes)

```bash
# Get your K3s node IP
kubectl get nodes -o wide

# Configure DNS A record in your domain provider:
# Type: A
# Name: openclaw (or @)
# Value: <your-k3s-node-ip>
# TTL: 600

# Wait for DNS to propagate (5-10 minutes)
```

### Step 8: Test (1 minute)

```bash
# Run the test script
./test-users.sh

# Or open browser to: http://your-domain.com
```

---

## ✅ Verification Checklist

After following the quick start, verify:

- [ ] All pods are in "Running" status
- [ ] Frontend accessible at http://your-domain.com
- [ ] Dedicated user registration works
- [ ] Shared user registration works
- [ ] File upload works for both modes
- [ ] No errors in pod logs

---

## 📋 Important Files Explained

### Configuration Files

| File | Purpose | Must Edit? |
|------|-----------|-------------|
| `01-namespace.yaml` | Creates K8s namespace | No |
| `02-configmap.yaml` | Resource limits, timeouts | Optional |
| `03-secret.yaml` | **API keys, passwords** | **YES** |
| `04-postgres.yaml` | PostgreSQL database | No |
| `05-platform-gateway.yaml` | Gateway backend | No |
| `06-shared-openclaw.yaml` | Shared OpenClaw pod | No |
| `07-frontend.yaml` | Frontend UI | No |
| `08-dedicated-users.yaml` | Dedicated users pods | No |
| `09-ingress.yaml` | **Domain name** | **YES** |

### Scripts

| Script | Purpose | When to Use |
|--------|-----------|-------------|
| `build-images.sh` | Build all Docker images | Before deployment |
| `import-images.sh` | Import images to K3s | After building images |
| `deploy.sh` | Deploy all K8s resources | After importing images |
| `health-check.sh` | Check deployment health | After deployment |
| `cleanup.sh` | Remove all resources | When cleaning up |
| `test-users.sh` | Test user modes | After deployment |

---

## 🎯 Common Scenarios

### Scenario 1: First-time Deployment

```bash
# Complete flow:
scp -r k8s-openclaw user@k3s-node:~/
ssh user@k3s-node
cd ~/k8s-openclaw
vim 03-secret.yaml  # Add your API keys
vim 09-ingress.yaml  # Add your domain
./deploy.sh
# Wait for pods to be ready
./test-users.sh
```

### Scenario 2: Update Platform Gateway

```bash
# SSH to K3s node
ssh user@k3s-node
cd ~/k8s-openclaw

# Build new image locally and transfer
# (From your local machine)
cd platform && docker build -t openclaw-gateway:latest .
docker save openclaw-gateway:latest | ssh user@k3s-node "k3s ctr images import -"

# Update deployment
ssh user@k3s-node "cd ~/k8s-openclaw && kubectl set image deployment/platform-gateway openclaw-gateway=openclaw-gateway:latest -n openclaw-system"

# Watch rollout
ssh user@k3s-node "kubectl rollout status deployment/platform-gateway -n openclaw-system"
```

### Scenario 3: Add More Users

```bash
# SSH to K3s node
ssh user@k3s-node
cd ~/k8s-openclaw

# Scale up dedicated users
kubectl scale statefulset openclaw-users -n openclaw-system --replicas=10

# Verify new pods
kubectl get pods -n openclaw-system
```

### Scenario 4: Troubleshoot Issues

```bash
# SSH to K3s node
ssh user@k3s-node
cd ~/k8s-openclaw

# Check health
./health-check.sh

# View logs
kubectl logs -n openclaw-system -l app=platform-gateway -f
kubectl logs -n openclaw-system -l app=shared-openclaw -f
kubectl logs -n openclaw-system -l app=postgres -f

# Describe problematic pod
kubectl describe pod <pod-name> -n openclaw-system
```

---

## 🔍 Quick Troubleshooting

### Pods Not Starting

```bash
# Check what's wrong
kubectl describe pod <pod-name> -n openclaw-system

# Common issues:
# 1. Image not found → Run ./import-images.sh
# 2. Resource limits → Check node resources with kubectl top nodes
# 3. Configuration error → Check kubectl logs <pod-name>
```

### Can't Access Website

```bash
# 1. Check if pods are running
kubectl get pods -n openclaw-system

# 2. Check ingress
kubectl get ingress -n openclaw-system

# 3. Check DNS
nslookup your-domain.com
ping your-domain.com

# 4. Check firewall
# Ensure ports 80 and 443 are open on K3s node
```

### File Upload Failing

```bash
# Check gateway logs for errors
kubectl logs -n openclaw-system -l app=platform-gateway --tail=50

# Check ingress configuration
kubectl describe ingress openclaw-ingress -n openclaw-system

# Verify paths are correct
# - Dedicated: /api/openclaw/filemanager/upload
# - Shared: /api/shared-openclaw/files/upload
```

---

## 📊 Resource Planning

### For 10 Users (All Dedicated)

**Total Resources Required**:
- CPU: 5 cores (10 users × 500m)
- RAM: 5GB (10 users × 512MB)
- Disk: 2GB (10 users × 200MB)
- Plus overhead: 1 CPU core, 1GB RAM for system services

**Minimum Node Specs**: 6 cores, 6GB RAM, 10GB disk

### For 10 Users (All Shared)

**Total Resources Required**:
- CPU: 1 core (shared)
- RAM: 512MB (shared)
- Disk: 20MB (shared)
- Plus overhead: 1 CPU core, 1GB RAM for system services

**Minimum Node Specs**: 2 cores, 2GB RAM, 5GB disk

### For Mixed Usage (5 Dedicated + 5 Shared)

**Total Resources Required**:
- CPU: 3.5 cores (5×500m + 0.5)
- RAM: 2.75GB (5×512MB + 250MB)
- Disk: 1.1GB (5×200MB + 10MB)
- Plus overhead: 1 CPU core, 1GB RAM for system services

**Minimum Node Specs**: 4 cores, 4GB RAM, 5GB disk

---

## 🔒 Security Checklist

Before going to production:

- [ ] Changed default admin password
- [ ] Changed default JWT secret
- [ ] Added real LLM API keys
- [ ] Configured custom domain
- [ ] Enabled HTTPS (TLS)
- [ ] Set up DNS correctly
- [ ] Configured firewall rules
- [ ] Set up backup strategy
- [ ] Configured monitoring
- [ ] Tested both user modes

---

## 📞 Getting Help

### Documentation

- **Comprehensive Guide**: Read `DEPLOY_GUIDE.md` for detailed instructions
- **README**: Check `README.md` for complete reference
- **Project Issues**: https://github.com/openclaw/MultiUserClaw/issues

### Quick Commands

```bash
# Get pod status
kubectl get pods -n openclaw-system

# Get all resources
kubectl get all -n openclaw-system

# View logs
kubectl logs -n openclaw-system -l app=platform-gateway --tail=100 -f

# Health check
./health-check.sh

# Cleanup
./cleanup.sh
```

### Common Problems

**Problem**: Pods stuck in Pending
- **Solution**: Check node resources, adjust resource limits

**Problem**: 502/504 errors
- **Solution**: Check ingress configuration, verify DNS

**Problem**: File upload fails
- **Solution**: Check ingress paths, verify file size limits

**Problem**: High memory usage
- **Solution**: Adjust resource limits, add swap

---

## 🎓 Next Steps

After successful deployment:

1. ✅ **Monitor Resources**: Use `health-check.sh` regularly
2. ✅ **Set Up Backups**: Configure automated backups
3. ✅ **Configure Monitoring**: Set up Prometheus/Grafana
4. ✅ **Optimize Performance**: Adjust resource limits based on usage
5. ✅ **Enable HTTPS**: Configure Let's Encrypt
6. ✅ **Test Load**: Test with multiple concurrent users
7. ✅ **Document**: Document your deployment and configuration

---

## 🎉 You're Ready!

If you've completed all the steps above, your MultiUserClaw deployment should be working!

Access it at: http://your-domain.com

For detailed documentation, see:
- `DEPLOY_GUIDE.md` - Comprehensive deployment guide
- `README.md` - Complete reference

Good luck! 🚀
