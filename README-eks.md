# Netflix-Styled App — Managed Kubernetes Deployment (AWS EKS)

A full stack movie review application deployed on Amazon EKS, AWS's managed Kubernetes service, using eksctl for cluster provisioning and LoadBalancer services for production-grade external access. This is the fourth and most production-oriented stage in a deliberate deployment progression of the same application.

---

## Project Overview

The same Netflix-inspired movie review platform, now running on a managed Kubernetes control plane. Where the earlier K3s deployment used a self-managed single node and NodePort exposure, this EKS deployment uses AWS-managed master nodes, autoscaling worker node groups, and AWS load balancers, the way Kubernetes is typically run in production.

---

## Why EKS

A managed Kubernetes service removes the burden of operating the control plane. AWS handles master node availability, upgrades, and patching, while the user manages only the worker nodes and workloads. This is the standard production approach and the most common Kubernetes setup referenced in job descriptions. Having already built single-node (K3s) and multi-node (kubeadm) clusters by hand, this stage demonstrates the managed path and the tradeoffs involved.

---

## Architecture

```
                MongoDB Atlas (cloud cluster)
                          ▲
                          │ mongodb+srv (Kubernetes secret)
                          │
        ┌─────────────────────────────────────────────┐
        │              AWS EKS Cluster                  │
        │   Control plane: managed by AWS               │
        │                                               │
        │   ┌─────────────────┐   ┌─────────────────┐   │
        │   │ Worker node 1   │   │ Worker node 2   │   │
        │   │ (t3.small)      │   │ (t3.small)      │   │
        │   └─────────────────┘   └─────────────────┘   │
        │                                               │
        │   backend Deployment  + LoadBalancer Service  │
        │   frontend Deployment + LoadBalancer Service  │
        └─────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
     AWS ELB (backend)              AWS ELB (frontend)
     port 8080                      port 80
              ▲                              ▲
              │                              │
        Browser reaches frontend, frontend calls backend
        via the backend's load balancer DNS name
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | Amazon EKS (managed Kubernetes) |
| Cluster provisioning | eksctl (YAML-driven) |
| Worker nodes | EC2 t3.small, managed node group, autoscaling 2 to 3 |
| External access | AWS Elastic Load Balancers (one per service) |
| Image registry | AWS ECR |
| Database | MongoDB Atlas |
| Frontend | React |
| Backend | Java Spring Boot |
| CLI tools | eksctl, kubectl, AWS CLI |

---

## Prerequisites

- Container images for frontend and backend available in AWS ECR (built and pushed via the GitHub Actions pipeline).
- A MongoDB Atlas cluster with network access configured.
- An IAM user with sufficient permissions to create an EKS cluster (EKS, EC2, CloudFormation, IAM, VPC). A dedicated admin user was created for this and removed afterward.

---

## Part 1: Tooling (Control Machine)

A small EC2 instance (t2.micro) serves as the control machine that drives cluster creation. It only runs CLI tools; the actual workloads run on the EKS worker nodes.

### Install AWS CLI, kubectl, and eksctl

```bash
# AWS CLI
sudo apt update && sudo apt install awscli -y
aws configure   # access key, secret, region us-east-1, format json

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# eksctl
curl --silent --location "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
```

Note: AWS CLI expects the region (us-east-1), not an availability zone (us-east-1c). Supplying an availability zone where a region is required is a common error.

---

## Part 2: Create the Cluster

### Cluster Definition (cluster.yaml)

```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: netflix-eks
  region: us-east-1
  version: "1.31"

managedNodeGroups:
  - name: workers
    instanceType: t3.small
    desiredCapacity: 2
    minSize: 2
    maxSize: 3
    volumeSize: 20
```

### Provision

```bash
eksctl create cluster -f cluster.yaml
```

This takes roughly 15 to 20 minutes. eksctl creates CloudFormation stacks for the control plane, a VPC with networking, and the worker node group. Progress can be monitored in the AWS CloudFormation console. On completion, kubectl is configured automatically.

Verify:

```bash
kubectl get nodes
```

Two worker nodes should report Ready.

---

## Part 3: Secrets

### ECR Pull Secret

```bash
kubectl create secret docker-registry ecr-secret \
  --docker-server=ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com \
  --docker-username=AWS \
  --docker-password=$(aws ecr get-login-password --region us-east-1)
```

### MongoDB Connection Secret

```bash
kubectl create secret generic mongo-secret \
  --from-literal=MONGO_URI='mongodb+srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/movieist?appName=netflix-cluster'
```

---

## Part 4: Backend Deployment (LoadBalancer Service)

The key difference from the K3s deployment is the Service type: LoadBalancer. On EKS this automatically provisions an AWS Elastic Load Balancer with a stable public DNS name, the production-grade alternative to NodePort.

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
  type: LoadBalancer
```

Apply, then retrieve the load balancer DNS name:

```bash
kubectl apply -f backend.yaml
kubectl get svc netflix-backend
```

The EXTERNAL-IP column shows the AWS load balancer DNS name (it may show pending for a few minutes while AWS provisions it). The backend can then be tested at:
http://<backend-lb-dns>:8080/api/v1/movies

---

## Part 5: Frontend Deployment

Because React bakes the backend API URL into the build at build time, the frontend image must be rebuilt with the backend's load balancer DNS name before deploying. The flow is:

1. Deploy the backend and obtain its load balancer DNS name.
2. Update src/api/axiosConfig.js with that URL.
3. Push, letting the GitHub Actions pipeline rebuild and push a new image to ECR.
4. Deploy the frontend referencing the new image.

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
    - port: 80
      targetPort: 3000
  type: LoadBalancer
```

The frontend service maps port 80 (standard web port) to container port 3000, so users reach it on a clean URL with no port number.

```bash
kubectl apply -f frontend.yaml
kubectl get svc netflix-frontend
```

Open the frontend load balancer DNS name in a browser (over http) to view the live site.

---

## Screenshots

Add captured screenshots here as evidence of the working deployment. Save them in a folder (for example `screenshots/`) and reference them with the markdown image syntax.

### Cluster Nodes
<!-- kubectl get nodes showing two EKS worker nodes Ready -->
`![EKS worker nodes](screenshots/get-nodes.png)`

### Services with LoadBalancer Endpoints
<!-- kubectl get svc showing both LoadBalancer services and their AWS DNS names -->
`![LoadBalancer services](screenshots/get-svc.png)`

### Running Pods
<!-- kubectl get pods showing frontend and backend Running -->
`![Running pods](screenshots/get-pods.png)`

### Live Application
<!-- The Netflix-styled site loaded in the browser via the frontend load balancer -->
`![Live site on EKS](screenshots/live-site.png)`

To embed an image: place the file in the screenshots folder, then replace each line above so it reads, for example, `![EKS worker nodes](screenshots/get-nodes.png)` without the surrounding backticks. GitHub will render it inline.

---

## Challenges and Key Learnings

### LoadBalancer vs NodePort
On EKS, setting a Service to type LoadBalancer automatically provisions a real AWS Elastic Load Balancer with a stable DNS name. This is the production-grade alternative to NodePort, which exposes services on volatile node IPs and ports. Each LoadBalancer service creates its own AWS load balancer, which has cost implications.

### Region vs Availability Zone
AWS tooling expects a region (us-east-1), not an availability zone (us-east-1c). Supplying an availability zone where a region is required causes failures. This distinction recurs across AWS services.

### Stale Image and the latest Tag Trap
After updating the frontend's backend URL, the running pod continued serving an old image. Two compounding causes: first, a local commit had not actually been pushed to GitHub, so no new image was built; second, even after rebuilding, restarting a deployment that references the latest tag can reuse a cached image rather than pulling the new one. The reliable fix is to reference a specific immutable build tag (for example :13) rather than :latest, which forces a fresh pull. Verifying the image push timestamp in ECR against the commit time confirmed which image was actually deployed.

### Build-Time vs Run-Time Configuration
The backend reads its database connection from an environment variable at runtime, so it can be injected via a Kubernetes secret. The React frontend bakes its API URL in at build time, so changing it requires rebuilding the image. Understanding this difference is essential to wiring the two tiers together.

### Careful Teardown to Avoid Orphaned Costs
LoadBalancer services create AWS load balancers that are not always removed when the cluster is deleted. The correct teardown order is: delete the Kubernetes services first (releasing the load balancers), confirm no load balancers remain, then run eksctl delete cluster. A final check with the AWS CLI confirmed zero remaining load balancers.

---

## Teardown Procedure

```bash
# 1. Delete services first so Kubernetes releases the load balancers
kubectl delete -f frontend.yaml
kubectl delete -f backend.yaml

# 2. Confirm no load balancer services remain (only the default kubernetes ClusterIP should show)
kubectl get svc

# 3. Delete the whole cluster (control plane, nodes, VPC, CloudFormation stacks)
eksctl delete cluster --name netflix-eks --region us-east-1

# 4. Final billing sanity check, both should return empty
aws elb describe-load-balancers --region us-east-1 --query 'LoadBalancerDescriptions[*].LoadBalancerName'
aws elbv2 describe-load-balancers --region us-east-1 --query 'LoadBalancers[*].LoadBalancerName'
```

Then terminate the control machine instance.

---

## Cost Note

EKS is the most expensive configuration in this series: the control plane bills hourly regardless of usage, plus two worker nodes, plus two load balancers, all running simultaneously. A strict build, verify, capture, tear-down discipline within a single session keeps the cost to a few dollars. The careful teardown order above is what prevents orphaned, silently billing resources.

---

## Deployment Progression

This is the fourth stage of deploying the same application, each teaching something the previous could not:

1. Manual deployment across three EC2 servers.
2. Dockerized deployment with a GitHub Actions CI/CD pipeline to ECR.
3. Kubernetes orchestration with single-node K3s.
4. Multi-node Kubernetes built by hand with kubeadm.
5. Managed Kubernetes on AWS EKS with LoadBalancer services (this document).

---

## Next Steps

- Provision the EKS cluster with Terraform instead of eksctl, for full infrastructure as code.
- Replace the separate LoadBalancers with a single Ingress controller and a domain name.
- Add HTTPS via AWS Certificate Manager.
- Introduce GitOps (ArgoCD) and monitoring (Prometheus, Grafana).

---

## Repository Links

- Backend: https://github.com/oshiokefred-collab/netflix-styled-backend
- Frontend: https://github.com/oshiokefred-collab/netflix-styled-frontend
