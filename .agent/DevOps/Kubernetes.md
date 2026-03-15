# Kubernetes Orchestration Basics

## 1. Pods & Services

- Understand that Pods are logically grouped containers.
- Use Services to provide a stable IP/DNS name for a group of Pods.

## 2. Deployments & Rollouts

- Use Deployments to manage stateless applications.
- Implement Rolling Updates to replace old pods with new ones without downtime.

## 3. ConfigMaps & Secrets

- Store configuration and sensitive data externally from the pod image.

## 4. Ingress Controllers

- Use Ingress (like Nginx) to route external HTTP/S traffic to internal services.

## 5. Autoscaling (HPA)

- Automatically scale the number of pods based on CPU or memory usage.
