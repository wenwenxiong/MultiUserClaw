# MultiUserClaw K3s Deployment Guide

This document provides quick instructions for deploying MultiUserClaw to K3s with both Dedicated and Shared user modes.

---

## 🚀 Quick Deployment (Recommended)

Use the automated deployment script for fastest results:

```bash
# 1. Copy deployment files to K3s node
scp -r k8s-openclaw/ user@k3s-node:~/k8s-openclaw/

# 2. SSH to K3s node and configure
ssh user@k3s-node
cd ~/k8s-openclaw

# 3. IMPORTANT: Edit these files
vim 03-secret.yaml     # Add your LLM API keys
vim 09-ingress.yaml    # Add your domain name

# 4. Build and import images
./build-images.sh
./import-images.sh

# 5. Deploy
./deploy.sh

# 6. Wait for pods to be ready
watch -n 2 'kubectl get pods -n openclaw-system'

# 7. Configure DNS
# Add A record: openclaw.yourdomain.com → <k3s-node-ip>

# 8. Test deployment
./test-users.sh
```

---

## 📋 Pre-Deployment Checklist

- [ ] K3s node SSH access available
- [ ] Docker installed on K3s node
- [ ] kubectl configured and connected
- [ ] Domain name registered
- [ ] At least one LLM API key available
- [ ] Sufficient disk space (minimum 20GB)
- [ ] K3s node has at least 2 CPU cores and 4GB RAM

---

## 📖 Detailed Documentation

For comprehensive deployment instructions, see:

- **Quick Start**: `k8s-openclaw/QUICKSTART.md`
- **Full Guide**: `k8s-openclaw/DEPLOY_GUIDE.md`
- **Reference**: `k8s-openclaw/README.md`

---

## 🏗️ Architecture

```
Internet
   │
   ▼
┌─────────────────────────────────────────────────────┐
│         Traefik Ingress (K3s)               │
└─────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Frontend  │  │   Gateway  │  │   Shared    │
│  :3000     │  │   :8080    │  │   :18080    │
└────────────┘  └────────────┘  └────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  Dedicated │  │  PostgreSQL │  │   HostPath  │
│  Users      │  │  Database   │  │  Storage    │
└────────────┘  └────────────┘  └────────────┘
```

### User Modes

**Dedicated Mode**:
- Each user gets their own OpenClaw container
- Complete data and resource isolation
- Supports all features including file uploads
- Resource usage: 512MB RAM + 500m CPU per user

**Shared Mode**:
- Multiple users share a single OpenClaw container
- Agent-level isolation via unique agent IDs
- Lightweight for API-only scenarios
- Resource usage: 200MB RAM + 500m CPU (shared)

---

## 🔧 Configuration

### Required Changes

**Before deploying, you MUST edit**:

1. **k8s-openclaw/03-secret.yaml**
   - Add your LLM API keys (Anthropic, OpenAI, DashScope, etc.)
   - Change default passwords

2. **k8s-openclaw/09-ingress.yaml**
   - Replace domain: `openclaw.yourdomain.com` with your actual domain

### Optional Configuration

You can optionally adjust:

- **k8s-openclaw/02-configmap.yaml**: Resource limits, timeouts
- **k8s-openclaw/05-platform-gateway.yaml**: Gateway resources
- **k8s-openclaw/06-shared-openclaw.yaml**: Shared pod resources
- **k8s-openclaw/07-frontend.yaml**: Frontend resources
- **k8s-openclaw/08-dedicated-users.yaml**: Per-user resource limits

---

## 📊 Resource Requirements

### Minimum (10 Dedicated Users)
- **CPU**: 6 cores (10×500m + 1 core overhead)
- **RAM**: 6GB (10×512MB + 1GB overhead)
- **Disk**: 2GB (10×200MB)

### Recommended (10 Dedicated Users)
- **CPU**: 8 cores
- **RAM**: 8GB
- **Disk**: 10GB

### Shared Mode (10 Users)
- **CPU**: 2 cores (0.5 + 1 core overhead)
- **RAM**: 2GB (250MB + 1GB overhead)
- **Disk**: 50MB (10×5MB)

---

## 🛠️ Deployment Scripts

### Automated Deployment

```bash
cd k8s-openclaw

# Quick deployment
./deploy.sh

# Health check
./health-check.sh

# Test users
./test-users.sh
```

### Manual Deployment Steps

1. Build images: `./build-images.sh`
2. Import images: `./import-images.sh`
3. Apply manifests: `kubectl apply -f *.yaml`
4. Monitor pods: `watch kubectl get pods -n openclaw-system`

---

## ✅ Verification

### Health Check

```bash
cd k8s-openclaw
./health-check.sh
```

### Test Users

```bash
cd k8s-openclaw
./test-users.sh
```

### Access Frontend

Open browser: `http://your-domain.com`

---

## 🔒 Security Notes

⚠️ **IMPORTANT SECURITY CONSIDERATIONS**:

1. **Change All Defaults**: Update all default passwords and secrets
2. **API Key Protection**: Never commit API keys to version control
3. **Enable TLS**: Configure Let's Encrypt for HTTPS
4. **Network Policies**: Consider implementing Kubernetes network policies
5. **Regular Updates**: Keep images and dependencies updated
6. **Backup Strategy**: Implement automated backup for data
7. **Monitoring**: Set up monitoring and alerting

---

## 📞 Troubleshooting

### Common Issues

**Pods stuck in Pending**:
```bash
kubectl describe pod <pod-name> -n openclaw-system
kubectl top nodes
```

**502/504 errors**:
```bash
kubectl describe ingress openclaw-ingress -n openclaw-system
kubectl get endpoints -n openclaw-system
```

**File upload failures**:
```bash
kubectl logs -n openclaw-system -l app=platform-gateway --tail=50
```

For more troubleshooting, see `k8s-openclaw/DEPLOY_GUIDE.md`.

---

## 📞 Support

- **Comprehensive Guide**: `k8s-openclaw/DEPLOY_GUIDE.md`
- **Quick Reference**: `k8s-openclaw/README.md`
- **Project Issues**: https://github.com/openclaw/MultiUserClaw/issues

---

## 🎯 Next Steps

After successful deployment:

1. ✅ Monitor deployment with `health-check.sh`
2. ✅ Configure backups for PostgreSQL and data
3. ✅ Set up monitoring (Prometheus/Grafana)
4. ✅ Test with multiple concurrent users
5. ✅ Optimize resource limits based on actual usage
6. ✅ Document your deployment

---

Good luck with your K3s deployment! 🚀
