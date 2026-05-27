# Netflix-Styled App — Full Stack Deployment Documentation

A full stack movie review application deployed manually on AWS EC2 across three separate servers. This document covers the complete deployment process, challenges encountered, and solutions applied.

---

## Application Overview

A Netflix-inspired movie review platform where users can browse movies and leave reviews. Built with a React frontend, Java Spring Boot backend, and MongoDB database.

---

## Architecture

```
User / Browser
      │
      │ port 3000
      ▼
┌─────────────────────────────┐
│     Frontend Server          │
│  React · Node.js 20          │
│  44.222.255.13               │
└─────────────┬───────────────┘
              │ port 8080 (REST API)
              ▼
┌─────────────────────────────┐
│     Backend Server           │
│  Java 17 · Spring Boot       │
│  Maven · 13.222.129.187      │
└─────────────┬───────────────┘
              │ port 27017 (MongoDB driver)
              ▼
┌─────────────────────────────┐
│     Database Server          │
│  MongoDB 7.0                 │
│  Authentication enabled      │
│  34.201.149.181              │
└─────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 18.x |
| Frontend runtime | Node.js | 20.x |
| Backend | Java Spring Boot | 3.0.1 |
| Build tool | Maven | 3.9.12 |
| Database | MongoDB Community Edition | 7.0.34 |
| Cloud provider | AWS EC2 | Ubuntu 26.04 |
| MongoDB GUI | MongoDB Compass | Latest |

---

## Server Setup

### Three EC2 Instances

| Server | Public IP | Purpose |
|---|---|---|
| Database | 34.201.149.181 | MongoDB installation |
| Backend | 13.222.129.187 | Java Spring Boot API |
| Frontend | 44.222.255.13 | React application |

### AWS Security Group — Inbound Rules

| Port | Source | Purpose |
|---|---|---|
| 22 | My IP | SSH access |
| 27017 | 0.0.0.0/0 | MongoDB access |
| 8080 | 0.0.0.0/0 | Backend API |
| 3000 | 0.0.0.0/0 | Frontend app |

---

## Part 1: MongoDB Setup (Database Server)

### Step 1 — Install MongoDB 7.0

> Note: MongoDB 8.0 is incompatible with Linux kernel 6.19+ which Ubuntu 26.04 ships with. MongoDB 7.0 must be used instead. See challenge section below for details.

```bash
sudo apt install gnupg curl -y

curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install mongodb-org -y
```

### Step 2 — Start and Enable MongoDB

```bash
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod
```

### Step 3 — Create Admin User

```bash
mongosh
use admin
db.createUser({
  user: "admin",
  pwd: "YourStrongPassword",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    "readWriteAnyDatabase"
  ]
})
exit
```

### Step 4 — Enable Authentication

Edit `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

> Warning: YAML indentation must use exactly 2 spaces. Tabs or incorrect indentation will break the service.

### Step 5 — Configure Remote Access

Edit `/etc/mongod.conf`:

```yaml
# network interfaces
net:
  port: 27017
  bindIp: 0.0.0.0
```

### Step 6 — Restart MongoDB

```bash
sudo systemctl restart mongod
```

### Step 7 — Connect via MongoDB Compass

```
mongodb://admin:YourPassword@34.201.149.181:27017/?authSource=admin
```

---

## Part 2: Backend Deployment (Backend Server)

### Step 1 — Install JDK 17

```bash
sudo apt install openjdk-17-jdk -y
java -version
```

### Step 2 — Install Maven

```bash
sudo apt install maven -y
mvn -version
```

### Step 3 — Clone Repository

```bash
git clone https://github.com/oshiokefred-collab/netflix-styled-backend.git
cd netflix-styled-backend
```

### Step 4 — Create Application Properties

```bash
mkdir -p src/main/resources
nano src/main/resources/application.properties
```

Contents:

```properties
spring.data.mongodb.uri=mongodb://admin:YourPassword@34.201.149.181:27017/movieist?authSource=admin
spring.data.mongodb.database=movieist
server.port=8080
```

### Step 5 — Build the Application

```bash
mvn clean package -DskipTests
```

### Step 6 — Run in Background

```bash
nohup java -jar target/*.jar > app.log 2>&1 &
```

### Step 7 — Import Movie Data

```bash
sudo apt-get install -y mongodb-database-tools

mongoimport --uri="mongodb://admin:YourPassword@34.201.149.181:27017/movieist?authSource=admin" \
  --collection=movies \
  --file=/home/ubuntu/netflix-styled-backend/_data/movies.json \
  --jsonArray
```

---

## Part 3: Frontend Deployment (Frontend Server)

### Step 1 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
node -v
npm -v
```

### Step 2 — Clone Repository

```bash
git clone https://github.com/oshiokefred-collab/netflix-styled-frontend.git
cd netflix-styled-frontend
```

### Step 3 — Configure Backend URL

Edit `src/api/axiosConfig.js`:

```javascript
import axios from 'axios';

export default axios.create({
    baseURL: 'http://13.222.129.187:8080',
    headers: {
        'Content-Type': 'application/json',
    },
});
```

### Step 4 — Add Swap Space (Required for low-RAM EC2)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Step 5 — Install Dependencies and Run

```bash
npm install
nohup npm start > frontend.log 2>&1 &
```

### Step 6 — Verify

```bash
curl http://localhost:3000
```

---

## Challenges and Solutions

### Challenge 1 — MongoDB 8.0 Incompatible with Linux Kernel 6.19+

**Problem:** MongoDB 8.0 refused to start with the following error:
```
MongoDB cannot start: Linux kernel versions 6.19 and newer has a known incompatibility with this version of MongoDB.
```

**Root cause:** An incompatibility between Linux kernel 6.19+ and the version of TCMalloc bundled with MongoDB 8.0. Ubuntu 26.04 ships with a kernel newer than 6.19.

**Solution:** Uninstalled MongoDB 8.0 and installed MongoDB 7.0 which predates this kernel incompatibility.

---

### Challenge 2 — YAML Indentation Error in mongod.conf

**Problem:** MongoDB service failed to start after config changes.

**Root cause:** The line `network interfaces` was missing a `#` comment character, making it invalid YAML.

**Solution:** Added `#` before `network interfaces` to make it a comment:
```yaml
# network interfaces
net:
  port: 27017
  bindIp: 0.0.0.0
```

---

### Challenge 3 — Frontend Crashed Due to Insufficient Memory

**Problem:** `npm start` crashed with the error:
```
The build failed because the process exited too early. This probably means the system ran out of memory.
```

**Solution:** Added 2GB of swap space to provide the server with additional virtual memory.

---

### Challenge 4 — mongoimport Not Found on Backend Server

**Problem:** `mongoimport: command not found` on the backend server.

**Solution:** Installed MongoDB database tools separately using the MongoDB 7.0 repository.

---

## Key Lessons Learned

1. **Databases are infrastructure, not code** — MongoDB is installed on a server, not stored in a repository.
2. **YAML is strict** — incorrect indentation or missing comment characters break the entire config file.
3. **Security groups are a second firewall** — even with MongoDB configured for remote access, AWS blocks ports by default.
4. **Sensitive credentials must never be committed to GitHub** — use environment variables or `.env` files.
5. **Manual deployment is complex** — this process is the foundation for understanding why Docker and CI/CD pipelines exist.

---

## Repository Links

- Backend: https://github.com/oshiokefred-collab/netflix-styled-backend
- Frontend: https://github.com/oshiokefred-collab/netflix-styled-frontend

---

## Next Steps

- Containerize with Docker
- Set up CI/CD pipeline
- Add HTTPS with SSL certificate
- Use environment variables instead of hardcoded IPs
