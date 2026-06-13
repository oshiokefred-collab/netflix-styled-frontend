# Netflix-Styled App — Kubernetes Deployment (K3s)

A full stack movie review application deployed on a single-node Kubernetes cluster using K3s, pulling container images from AWS ECR and connecting to a managed MongoDB Atlas database. This is the orchestration stage that follows the earlier manual and Dockerized deployments, demonstrating how Kubernetes manages containerized workloads.

---

## Project Overview

The same Netflix-inspired movie review platform, now deployed and orchestrated by Kubernetes. Where the Docker stage ran containers manually with `docker run`, this stage hands that responsibility to Kubernetes, which manages the container lifecycle, networking, and configuration through declarative manifests.

---

## Why Single-Node (K3s)

Following a fundamentals-first learning approach, this deployment uses K3s, a lightweight certified Kubernetes distribution, on a single EC2 instance acting as both control plane and worker. This keeps costs minimal for learning while teaching the same core concepts (pods, deployments, services, secrets) that apply to any Kubernetes environment, including managed EKS. The same kubectl commands and manifests transfer directly to larger clusters.

---

## Architecture

```
                MongoDB Atlas (cloud cluster)
                          ▲
                          │ mongodb+srv connection (Kubernetes secret)
                          │
        ┌─────────────────────────────────────────┐
        │   Single EC2 Instance (K3s cluster)      │
        │                                          │
        │   ┌────────────────────────────────┐     │
        │   │  netflix-backend Deployment     │     │
        │   │  (pod, port 8080)               │     │
        │   │  Service: NodePort 30080        │     │
        │   └────────────────────────────────┘     │
        │                                          │
        │   ┌────────────────────────────────┐     │
        │   │  netflix-frontend Deployment    │     │
        │   │  (pod, port 3000)               │     │
        │   │  Service: NodePort 30000        │     │
        │   └────────────────────────────────┘     │
        │                                          │
        │   Images pulled from ECR via ecr-secret  │
        └─────────────────────────────────────────┘
                          ▲
                          │ docker pull (imagePullSecrets)
                          │
                   AWS ECR (image registry)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | Kubernetes (K3s) |
| Container runtime | containerd (bundled with K3s) |
| Image registry | AWS Elastic Container Registry (ECR) |
| Database | MongoDB Atlas |
| Compute | AWS EC2 (Ubuntu 24.04) |
| Frontend | React |
| Backend | Java Spring Boot |
| CLI tools | kubectl, AWS CLI |

---

## Prerequisites

- Container images already built and pushed to ECR (via the GitHub Actions pipeline from the Docker stage).
- A MongoDB Atlas cluster with network access configured.
- An IAM user with ECR pull permissions and its access keys.

---

## Part 1: Cluster Setup

### Launch EC2 Instance
A t2.small or larger instance (K3s plus both application pods need more than 1GB RAM).

### Install K3s

```bash
sudo apt update
curl -sfL https://get.k3s.io | sh -
```

### Configure kubectl

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
export KUBECONFIG=~/.kube/config
echo "export KUBECONFIG=~/.kube/config" >> ~/.bashrc
```

### Verify

```bash
kubectl get nodes
```

The single node should report status Ready, acting as both control-plane and worker.

---

## Part 2: Secrets

### ECR Pull Secret
Allows Kubernetes to authenticate with the private ECR registry. The token is valid for 12 hours.

```bash
kubectl create secret docker-registry ecr-secret \
  --docker-server=ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password --region us-east-1)
```

### MongoDB Connection Secret
Injects the Atlas connection string at runtime rather than baking it into the image.

```bash
kubectl create secret generic mongo-secret \
  --from-literal=MONGO_URI='mongodb+srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/movieist?appName=netflix-cluster'
```

---

## Part 3: Backend Deployment

The backend manifest defines a Deployment (which image to run, how many replicas, which secrets) and a NodePort Service (to expose it).

Key points:
- `imagePullSecrets` references ecr-secret so the pod can pull from the private registry.
- The MongoDB URI is injected as the environment variable SPRING_DATA_MONGODB_URI, which Spring Boot maps to spring.data.mongodb.uri, overriding any baked-in value.
- NodePort 30080 exposes the backend on the node's public IP.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: netflix-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: netflix-backend
  template:
    metadata:
      labels:
        app: netflix-backend
    spec:
      imagePullSecrets:
        - name: ecr-secret
      containers:
        - name: netflix-backend
          image: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/netflix-backend:latest
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_DATA_MONGODB_URI
              valueFrom:
                secretKeyRef:
                  name: mongo-secret
                  key: MONGO_URI
---
apiVersion: v1
kind: Service
metadata:
  name: netflix-backend
spec:
  selector:
    app: netflix-backend
  ports:
    - port: 8080
      targetPort: 8080
      nodePort: 30080
  type: NodePort
```

Apply and verify:

```bash
kubectl apply -f backend.yaml
kubectl get pods
kubectl logs <backend-pod-name>
```

Successful startup shows Spring Boot connecting to the Atlas replica set and "Started MovieistApplication".

---

## Part 4: Frontend Deployment

The frontend image is built with the backend URL baked in at build time (a React characteristic). Before deploying, axiosConfig.js was updated to point to the backend's NodePort address (http://NODE_IP:30080), then the GitHub Actions pipeline rebuilt and pushed the image.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: netflix-frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: netflix-frontend
  template:
    metadata:
      labels:
        app: netflix-frontend
    spec:
      imagePullSecrets:
        - name: ecr-secret
      containers:
        - name: netflix-frontend
          image: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/netflix-frontend:latest
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: netflix-frontend
spec:
  selector:
    app: netflix-frontend
  ports:
    - port: 3000
      targetPort: 3000
      nodePort: 30000
  type: NodePort
```

Apply and verify:

```bash
kubectl apply -f frontend.yaml
kubectl get pods
```

---

## Part 5: Networking / Access

AWS Security Group inbound rules required:

| Port | Purpose |
|---|---|
| 22 | SSH |
| 30080 | Backend NodePort |
| 30000 | Frontend NodePort |

Access the application:
- Backend API: http://NODE_IP:30080/api/v1/movies
- Frontend site: http://NODE_IP:30000

---

## Useful kubectl Commands

| Command | Purpose |
|---|---|
| kubectl get nodes | List cluster nodes |
| kubectl get pods | List running pods |
| kubectl get svc | List services and their ports |
| kubectl get all | Show all resources at once |
| kubectl logs <pod> | View a pod's logs |
| kubectl describe pod <pod> | Detailed pod info for troubleshooting |
| kubectl apply -f file.yaml | Create or update resources from a manifest |
| kubectl delete -f file.yaml | Remove resources defined in a manifest |

---

## Challenges and Key Learnings

### Frontend Backend URL Is Baked In at Build Time
React compiles the API base URL into the build, so it cannot be changed at runtime via a Kubernetes env variable the way the backend's can. The URL had to be updated in source and the image rebuilt before deployment. This is a fundamental difference between how the frontend and backend receive configuration.

### Backend Configuration via Environment Variable
Spring Boot reads SPRING_DATA_MONGODB_URI and maps it to its MongoDB property automatically, so the connection string could be injected cleanly from a Kubernetes secret at runtime, overriding the baked-in value.

### ECR Authentication in Kubernetes
Unlike manual `docker login`, Kubernetes needs registry credentials stored as a docker-registry secret and referenced via imagePullSecrets. The ECR token expires after 12 hours; for a permanent setup, granting the node an IAM role with ECR access is the production-correct approach (documented here as a known limitation of the manual-secret method).

### Connection Timeout vs Connection Refused
A browser timeout pointed to a missing Security Group rule (request dropped at the firewall), as opposed to "connection refused" which would indicate the service itself was not listening. Distinguishing the two speeds up troubleshooting.

---

## Cost Management

The single-node K3s approach avoids the EKS control-plane charge, costing only the single EC2 instance. Following a spin-up and tear-down discipline (deploy, demo, capture evidence, then terminate the instance) keeps learning costs to a few cents.

---

## Deployment Progression

This is the third stage in a deliberate progression of the same application:

1. Manual deployment across three EC2 servers.
2. Dockerized deployment with a GitHub Actions CI/CD pipeline pushing to ECR.
3. Kubernetes orchestration with K3s (this document).

---

## Next Steps

- Deploy to managed EKS, ideally provisioned with Terraform.
- Replace NodePort with an Ingress controller and a domain name.
- Introduce GitOps (for example ArgoCD) so the cluster state is driven from Git.
- Add monitoring with Prometheus and Grafana.

---

## Repository Links

- Backend: https://github.com/oshiokefred-collab/netflix-styled-backend
- Frontend: https://github.com/oshiokefred-collab/netflix-styled-frontend
