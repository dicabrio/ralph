# Docker Best Practices

Dit document beschrijft de aanbevolen best practices voor Docker containerization, inclusief multi-stage builds, security, en orchestration.

## Inhoudsopgave

- [Dockerfile Basics](#dockerfile-basics)
- [Multi-Stage Builds](#multi-stage-builds)
- [Security](#security)
- [Image Optimalisatie](#image-optimalisatie)
- [Docker Compose](#docker-compose)
- [Production Deployment](#production-deployment)
- [Monitoring en Logging](#monitoring-en-logging)

---

## Dockerfile Basics

### Basis Structuur

```dockerfile
# Gebruik specifieke versie tags, nooit 'latest'
FROM node:20-alpine AS base

# Metadata
LABEL maintainer="team@example.com"
LABEL version="1.0.0"
LABEL description="Application description"

# Set working directory
WORKDIR /app

# Copy dependency files eerst (voor caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy applicatie code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Non-root user
USER node

# Start command
CMD ["node", "dist/index.js"]
```

### Layer Caching Optimalisatie

```dockerfile
# GOED: Dependency files apart kopiëren
COPY package.json package-lock.json ./
RUN npm ci

# Dan pas source code
COPY src/ ./src/

# SLECHT: Alles tegelijk kopiëren (invalidates cache bij elke code change)
COPY . .
RUN npm ci
```

---

## Multi-Stage Builds

### Node.js TypeScript Applicatie

```dockerfile
# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies voor build)
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies van vorige stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# ============================================
# Stage 3: Runner (Production)
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Security: non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy alleen wat nodig is
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Switch to non-root user
USER appuser

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### React/Vite Frontend

```dockerfile
# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments voor environment-specifieke builds
ARG VITE_API_URL
ARG VITE_ENV=production

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENV=$VITE_ENV

RUN npm run build

# ============================================
# Stage 3: Production (NGINX)
# ============================================
FROM nginx:alpine AS runner

# Custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Security headers config
COPY security-headers.conf /etc/nginx/conf.d/security-headers.conf

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

### Python FastAPI Applicatie

```dockerfile
# ============================================
# Stage 1: Builder
# ============================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ============================================
# Stage 2: Runner
# ============================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser

# Copy application
COPY --chown=appuser:appuser . .

USER appuser

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Security

### Non-Root User

```dockerfile
# Methode 1: Gebruik bestaande user (node images)
USER node

# Methode 2: Maak nieuwe user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

USER appuser

# Methode 3: Alpine specifiek
RUN adduser -D -u 1001 appuser
USER appuser
```

### Read-Only Filesystem

```yaml
# docker-compose.yml
services:
  app:
    image: myapp:latest
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
    volumes:
      - data:/app/data:ro  # Read-only mount
```

### Security Scanning

```bash
# Scan image met Trivy
trivy image myapp:latest

# Scan image met Docker Scout
docker scout cves myapp:latest

# Scan tijdens build
docker build --target builder --progress=plain .
```

### Secrets Management

```dockerfile
# NOOIT secrets in Dockerfile!

# SLECHT
ENV DATABASE_PASSWORD=mysecretpassword

# GOED: Gebruik build secrets (BuildKit)
RUN --mount=type=secret,id=db_password \
    cat /run/secrets/db_password > /app/.env

# Of gebruik Docker secrets in runtime
```

```yaml
# docker-compose.yml met secrets
services:
  app:
    image: myapp:latest
    secrets:
      - db_password
      - api_key
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
  api_key:
    external: true
```

### Content Trust

```bash
# Enable Docker Content Trust
export DOCKER_CONTENT_TRUST=1

# Sign images
docker trust sign myregistry/myapp:latest

# Verify signatures
docker trust inspect myregistry/myapp:latest
```

---

## Image Optimalisatie

### Base Image Selectie

```dockerfile
# Grootte vergelijking (Node.js):
# node:20          ~1GB
# node:20-slim     ~200MB
# node:20-alpine   ~130MB
# gcr.io/distroless/nodejs20  ~120MB

# Voor development
FROM node:20-slim AS development

# Voor production (kleinste, veiligste)
FROM gcr.io/distroless/nodejs20-debian12 AS production
```

### .dockerignore

```dockerignore
# Git
.git
.gitignore

# Dependencies (worden geïnstalleerd in container)
node_modules
.pnp
.pnp.js

# Build output
dist
build
.next
out

# Development files
.env.local
.env.development
.env.test

# IDE
.idea
.vscode
*.swp
*.swo

# Logs
logs
*.log
npm-debug.log*

# Test
coverage
.nyc_output

# Docker files (niet nodig in image)
Dockerfile*
docker-compose*
.docker

# Documentation
README.md
CHANGELOG.md
docs
```

### Layer Minimalisatie

```dockerfile
# SLECHT: Meerdere RUN commands
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN rm -rf /var/lib/apt/lists/*

# GOED: Gecombineerde RUN command
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget \
    && rm -rf /var/lib/apt/lists/*
```

### BuildKit Features

```dockerfile
# Enable BuildKit
# DOCKER_BUILDKIT=1 docker build .

# Cache mount voor package managers
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Bind mount voor grote files (niet in image)
RUN --mount=type=bind,source=large-file.tar.gz,target=/tmp/large-file.tar.gz \
    tar -xzf /tmp/large-file.tar.gz -C /app
```

---

## Docker Compose

### Development Setup

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: development
    volumes:
      - .:/app
      - /app/node_modules  # Exclude node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://user:pass@db:5432/app
    depends_on:
      db:
        condition: service_healthy
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
        - action: rebuild
          path: package.json

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=app
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### Production Setup

```yaml
# docker-compose.prod.yml
services:
  app:
    image: myregistry/myapp:${VERSION:-latest}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    environment:
      - NODE_ENV=production
    secrets:
      - db_password
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - app

secrets:
  db_password:
    external: true
```

---

## Production Deployment

### Health Checks

```dockerfile
# HTTP health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# TCP health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD nc -z localhost 3000 || exit 1

# Custom script
COPY healthcheck.sh /usr/local/bin/
HEALTHCHECK --interval=30s --timeout=10s \
  CMD /usr/local/bin/healthcheck.sh
```

### Graceful Shutdown

```dockerfile
# Gebruik exec form voor correct signal handling
CMD ["node", "dist/index.js"]

# NIET shell form (signals gaan niet naar process)
CMD node dist/index.js
```

```typescript
// Graceful shutdown in Node.js
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');

  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Close database connections
  await db.end();

  // Exit
  process.exit(0);
});

// Timeout fallback
setTimeout(() => {
  console.error('Forced shutdown after timeout');
  process.exit(1);
}, 30000);
```

### Resource Limits

```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M
    # Of via command line
    # docker run --memory=512m --cpus=1 myapp
```

---

## Monitoring en Logging

### Structured Logging

```typescript
// Gebruik JSON logging voor container environments
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

logger.info({ event: 'server_start', port: 3000 }, 'Server started');
```

### Log Rotation

```yaml
services:
  app:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"
        compress: "true"
```

### Prometheus Metrics

```dockerfile
# Expose metrics port
EXPOSE 3000
EXPOSE 9090  # Metrics endpoint
```

```yaml
services:
  app:
    ports:
      - "3000:3000"
    labels:
      - "prometheus.scrape=true"
      - "prometheus.port=9090"
      - "prometheus.path=/metrics"
```

### Container Inspect Commands

```bash
# View logs
docker logs -f --tail 100 container_name

# Resource usage
docker stats container_name

# Inspect container
docker inspect container_name

# Execute command in running container
docker exec -it container_name sh

# View processes
docker top container_name
```

---

## Bronnen

- [Docker Build Best Practices](https://docs.docker.com/build/building/best-practices/)
- [Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Security Best Practices](https://betterstack.com/community/guides/scaling-docker/docker-security-best-practices/)
- [Modern Docker Best Practices for 2025](https://talent500.com/blog/modern-docker-best-practices-2025/)
- [Optimise Your Docker Images for Speed and Security](https://saraswathilakshman.medium.com/optimise-your-docker-images-for-speed-and-security-best-practices-for-2025-e888f6dc131f)
