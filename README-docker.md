# Netflix-Styled App — Dockerized Deployment with CI/CD

A full stack movie review application deployed using Docker containers, automated CI/CD pipelines via GitHub Actions, AWS Elastic Container Registry (ECR), and MongoDB Atlas. This is the containerized evolution of an earlier manual deployment, demonstrating modern DevOps practices.

---

## Project Overview

A Netflix-inspired movie review platform where users can browse movies and leave reviews. This version replaces manual server setup with containerization and automation.

---

## Architecture

```
                MongoDB Atlas (cloud cluster)
                          ▲
                          │ connection string (injected via GitHub Secret)
                          │
            ┌─────────────────────────────┐
            │      AWS EC2 Server          │
            │                              │
            │  Backend container (8080)    │
            │  Frontend container (3000)   │
            └─────────────────────────────┘
                          ▲
                          │ docker pull
                          │
                   AWS ECR (image registry)
                          ▲
                          │ docker push
                          │
              GitHub Actions CI/CD Pipeline
                          ▲
                          │ git push
                          │
                     Source Code (GitHub)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (served via `serve`) |
| Backend | Java Spring Boot |
| Database | MongoDB Atlas (M0 free cluster) |
| Containerization | Docker |
| Image Registry | AWS Elastic Container Registry (ECR) |
| CI/CD | GitHub Actions |
| Cloud Compute | AWS EC2 (Ubuntu 26.04) |
| Secrets Management | GitHub Repository Secrets |

---

## Comparison: Manual vs Dockerized

| Aspect | Manual Deployment | Dockerized Deployment |
|---|---|---|
| Environment setup | Install Java, Maven, Node manually | Defined once in Dockerfile |
| Build process | Run commands by hand on server | Automated via GitHub Actions |
| Image storage | None | AWS ECR |
| Deployment | Manual clone, build, run | Pull image and run |
| Repeatability | Error-prone, slow | Consistent, fast |
| Database | Self-hosted MongoDB on EC2 | Managed MongoDB Atlas |

---

## Part 1: MongoDB Atlas Setup

1. Created a free M0 cluster on AWS (us-east-1 region).
2. Created a database user with Atlas Admin privileges.
3. Configured Network Access to allow connections (IP Access List set to 0.0.0.0/0 for learning; production should whitelist specific IPs).
4. Saved the connection string for use in the backend configuration.

Connection string format:
```
mongodb+srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/movieist?appName=netflix-cluster
```

---

## Part 2: Docker Installation (EC2 Server)

```bash
sudo apt update
sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker

# Allow running docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
```

---

## Part 3: Backend Containerization

### Dockerfile (Full build approach)

The backend Dockerfile uses Ubuntu as a base, installs JDK 17 and Maven, copies source code, builds the JAR, and runs it.

```dockerfile
FROM ubuntu
RUN apt-get update && apt-get install -y
RUN apt install openjdk-17-jre-headless -y
RUN apt install maven -y
WORKDIR /app
COPY application.properties /app/src/main/resources/application.properties
COPY ./src /app/src
COPY ./pom.xml /app
RUN mvn -f /app/pom.xml clean package
RUN cp /app/target/*.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Local Test Build

```bash
docker build -t netflix-backend .
docker run -d -p 8080:8080 --name netflix-backend netflix-backend
curl http://localhost:8080/api/v1/movies
```

---

## Part 4: AWS ECR Setup

1. Created two private ECR repositories: `netflix-backend` and `netflix-frontend`.
2. Created an IAM user named `pipeline` with ECR push permissions.
3. Generated access keys for the IAM user.

Repository URIs:
```
184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-backend
184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-frontend
```

---

## Part 5: GitHub Secrets

Stored securely in each repository under Settings > Secrets and variables > Actions.

### Backend Secrets
| Name | Purpose |
|---|---|
| AWS_ACCESS_KEY_ID | IAM access key |
| AWS_SECRET_ACCESS_KEY | IAM secret key |
| AWS_REGION | us-east-1 |
| AWS_ACCOUNT_ID | AWS account number |
| ECR_REPOSITORY | netflix-backend |
| MONGO_URI | Atlas connection string |

### Frontend Secrets
Same as above, except no MONGO_URI, and ECR_REPOSITORY is netflix-frontend.

---

## Part 6: CI/CD Pipeline (GitHub Actions)

The workflow file lives at `.github/workflows/cicd.yaml` in each repo. On every push to master, it:

1. Checks out the code.
2. Configures AWS credentials from secrets.
3. Logs in to ECR.
4. (Backend only) Creates application.properties from the MONGO_URI secret.
5. Builds the Docker image, tags it with the GitHub run number and latest.
6. Pushes both tags to ECR.

The backend pipeline injects the database connection string at build time using echo commands, so credentials never appear in the repository.

---

## Part 7: Deploying from ECR to EC2

### Install and Configure AWS CLI

```bash
sudo apt install awscli -y
aws configure   # enter access key, secret, region (us-east-1), format (json)
```

### Authenticate Docker with ECR

```bash
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 184933499170.dkr.ecr.us-east-1.amazonaws.com
```

### Pull and Run Backend

```bash
docker pull 184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-backend:latest
docker run -d -p 8080:8080 --name netflix-backend 184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-backend:latest
```

### Pull and Run Frontend

```bash
docker pull 184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-frontend:latest
docker run -d -p 3000:3000 --name netflix-frontend 184933499170.dkr.ecr.us-east-1.amazonaws.com/netflix-frontend:latest
```

### Import Movie Data into Atlas

```bash
mongoimport --uri="mongodb+srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/movieist?appName=netflix-cluster" \
  --collection=movies \
  --file=_data/movies.json \
  --jsonArray
```

---

## AWS Security Group — Inbound Rules

| Port | Purpose |
|---|---|
| 22 | SSH access |
| 8080 | Backend API |
| 3000 | Frontend app |

---

## Challenges and Solutions

### Challenge 1 — Pipeline Error: "Input required and not supplied: aws-region"
**Cause:** All credential values were stored in a single secret instead of six individually named secrets.
**Solution:** Created each secret separately with exact names matching the workflow file.

### Challenge 2 — Confusing Region with Availability Zone
**Cause:** Used us-east-1d (an availability zone) instead of us-east-1 (the region).
**Solution:** Set AWS_REGION to us-east-1 without the trailing zone letter.

### Challenge 3 — Frontend Pointing to Old Backend
**Cause:** axiosConfig.js still referenced the old manual-deployment backend IP. React bakes this URL in at build time.
**Solution:** Updated the baseURL to the new backend server before building the image.

### Challenge 4 — Push Rejected (fetch first)
**Cause:** Remote had commits not present locally.
**Solution:** Ran git pull origin master before pushing.

---

## Key Lessons Learned

1. Docker captures all environment setup once, making deployments fast and repeatable.
2. CI/CD pipelines remove manual build steps entirely; pushing code triggers everything.
3. Secrets must be named exactly as referenced in the workflow, and stored individually.
4. AWS region and availability zone are different things; tools expect the region.
5. React environment configuration is baked in at build time, not runtime.
6. Managed services like MongoDB Atlas remove the burden of self-hosting databases.

---

## Repository Links

- Backend: https://github.com/oshiokefred-collab/netflix-styled-backend
- Frontend: https://github.com/oshiokefred-collab/netflix-styled-frontend

---

## Next Steps

- Add an Elastic IP and domain name for a stable address.
- Add HTTPS with an SSL certificate via Nginx reverse proxy.
- Introduce Kubernetes for container orchestration.
- Use Terraform for infrastructure as code.
