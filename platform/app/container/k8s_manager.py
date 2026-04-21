"""K8s container lifecycle management for dedicated user pods.

This module provides K8s-native pod management using the Python kubernetes library.
"""

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from kubernetes import watch
import logging
import asyncio
from typing import Dict, Optional, List

logger = logging.getLogger(__name__)


class K8sContainerManager:
    """K8s container manager for dedicated user pods."""
    
    def __init__(self):
        """Initialize K8s client and configuration."""
        try:
            config.load_incluster_config()
            self.core_v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            self.namespace = "openclaw-system"
            self.logger = logging.getLogger(__name__)
            self.logger.info("K8s client initialized successfully")
        except config.ConfigException as exc:
            logger.error(f"Failed to load in-cluster config: {exc}")
            raise RuntimeError(f"K8s in-cluster config not available: {exc}")
    
    async def create_dedicated_pod(self, db, user_id: str) -> str:
        """Create a K8s Pod for a dedicated user.
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Pod name
        """
        try:
            short_id = user_id[:8]
            pod_name = f"openclaw-user-{short_id}"
            
            # Create Pod manifest
            pod_manifest = {
                "apiVersion": "v1",
                "kind": "Pod",
                "metadata": {
                    "name": pod_name,
                    "labels": {
                        "app": "platform-gateway",
                        "user-id": user_id,
                        "runtime-mode": "dedicated"
                    }
                },
                "spec": {
                    "containers": [{
                        "name": "openclaw",
                        "image": "openclaw-user:latest",
                        "command": ["node", "bridge/dist/bridge/start.js"],
                        "env": [
                            {"name": "USER_ID", "value": user_id},
                            {"name": "NANOBOT_PROXY__URL", "value": "http://platform-gateway-service.openclaw-system.svc.cluster.local:8080/llm/v1"},
                            {"name": "NANOBOT_PROXY__TOKEN", "valueFrom": {
                                "configMapKeyRef": "openclaw-secrets",
                                "key": "PLATFORM_SHARED_OPENCLAW_SYSTEM_TOKEN"
                            }},
                            {"name": "NANOBOT_AGENTS__DEFAULTS__MODEL", "valueFrom": {
                                "configMapKeyRef": "openclaw-config",
                                "key": "PLATFORM_DEFAULT_MODEL"
                            }},
                            {"name": "TZ", "valueFrom": {
                                "configMapKeyRef": "openclaw-config",
                                "key": "PLATFORM_CONTAINER_TZ"
                            }},
                            {"name": "BRIDGE_ENABLE_CHANNELS", "value": "1"}
                        ],
                        "ports": [{"containerPort": 18080}],
                        "volumeMounts": [{
                            "name": "user-data",
                            "mountPath": "/root/.openclaw",
                            "volume": {
                                "name": f"openclaw-data-{short_id}",
                                "persistentVolumeClaim": {
                                    "claimName": f"openclaw-pvc-{short_id}"
                                }
                            }
                        }],
                        "resources": {
                            "requests": {
                                "memory": "256Mi",
                                "cpu": "100m"
                            },
                            "limits": {
                                "memory": "512Mi",
                                "cpu": "500m"
                            }
                        }
                    }]
                }
            }
            
            self.logger.info(f"Creating K8s pod {pod_name} for user {user_id}")
            
            # Create Pod
            pod = self.core_v1.create_namespaced_pod(
                namespace=self.namespace,
                body=pod_manifest
            )
            
            self.logger.info(f"K8s pod {pod_name} created successfully")
            return pod_name
            
        except ApiException as exc:
            logger.error(f"Failed to create K8s pod: {exc}")
            raise RuntimeError(f"K8s pod creation failed: {exc}")
    
    async def delete_dedicated_pod(self, pod_name: str) -> bool:
        """Delete a K8s Pod for a dedicated user.
        
        Args:
            pod_name: Pod name
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.logger.info(f"Deleting K8s pod {pod_name}")
            
            # Delete Pod
            self.core_v1.delete_namespaced_pod(
                name=pod_name,
                namespace=self.namespace
            )
            
            self.logger.info(f"K8s pod {pod_name} deleted successfully")
            return True
            
        except ApiException as exc:
            logger.error(f"Failed to delete K8s pod {exc}")
            return False
    
    async def get_pod_status(self, pod_name: str) -> Dict:
        """Get K8s pod status.
        
        Args:
            pod_name: Pod name
            
        Returns:
            Dictionary with pod status information
        """
        try:
            pod = self.core_v1.read_namespaced_pod(
                name=pod_name,
                namespace=self.namespace
            )
            
            return {
                "name": pod.metadata.name,
                "status": pod.status.phase,
                "pod_ip": pod.status.pod_ip,
                "phase": pod.status.phase,
                "start_time": pod.status.start_time.isoformat() if pod.status.start_time else None,
                "container_statuses": [
                    {
                        "name": c.name,
                        "state": c.state,
                        "state": {
                            "waiting": "Waiting",
                            "running": "Running",
                            "terminated": "Terminated",
                            "unknown": "Unknown"
                        }.get(c.state, "Unknown")
                    }
                    for c in pod.status.container_statuses
                ]
            }
            
        except ApiException as exc:
            logger.error(f"Failed to get pod status: {exc}")
            return {
                "name": pod_name,
                "status": "unknown",
                "pod_ip": None,
                "phase": "unknown"
            }
    
    async def get_pod_logs(self, pod_name: str, tail_lines: int = 100) -> str:
        """Get K8s pod logs.
        
        Args:
            pod_name: Pod name
            tail_lines: Number of tail lines
            
        Returns:
            Pod logs as string
        """
        try:
            self.logger.info(f"Getting logs for K8s pod {pod_name} (last {tail_lines} lines)")
            
            logs = self.core_v1.read_namespaced_pod_log(
                name=pod_name,
                namespace=self.namespace,
                tail_lines=tail_lines
            )
            
            return logs
            
        except ApiException as exc:
            logger.error(f"Failed to get pod logs: {exc}")
            return f"Error getting pod logs: {exc}"
    
    async def list_dedicated_pods(self) -> List[str]:
        """List all dedicated user pods.
        
        Returns:
            List of pod names
        """
        try:
            self.logger.info("Listing dedicated user pods")
            
            pods = self.core_v1.list_namespaced_pod(
                namespace=self.namespace,
                label_selector="app=platform-gateway"
            )
            
            pod_names = [pod.metadata.name for pod in pods.items]
            
            self.logger.info(f"Found {len(pod_names)} dedicated pods")
            return pod_names
            
        except ApiException as exc:
            logger.error(f"Failed to list pods: {exc}")
            return []
