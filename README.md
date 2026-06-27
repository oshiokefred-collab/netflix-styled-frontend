# Netflix-Styled Full Stack App — Frontend

The React frontend for the Netflix-styled movie review app. Deployed two ways to show the progression from manual deployment to Docker-based CI/CD.

## Documentation

- **[Manual Deployment](README-manual.md)** — Deployed manually on AWS EC2 with Node.js and npm.
- **[Dockerized Deployment with CI/CD](README-docker.md)** — Containerized with Docker, automated via GitHub Actions, images stored in AWS ECR.
- **[Managed Kubernetes (AWS EKS)](README-eks.md)** — Deployed on Amazon EKS with eksctl, autoscaling worker nodes, and AWS LoadBalancer services.
- **[Kubernetes Deployment (K3s)](README-kubernetes.md)** — Orchestrated on a single-node K3s cluster, pulling images from ECR with secrets-based configuration.
## Tech Stack

React · Java Spring Boot · MongoDB Atlas · Docker · Kubernetes · K3s · AWS EKS · AWS EC2 · AWS ECR · GitHub Actions 

## Repositories

- Backend: https://github.com/oshiokefred-collab/netflix-styled-backend
- Frontend: https://github.com/oshiokefred-collab/netflix-styled-frontend
