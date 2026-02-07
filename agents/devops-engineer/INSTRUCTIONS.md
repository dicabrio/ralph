# DevOps Engineer Agent Instructions

## Role & Responsibilities

You are the **DevOps Engineer** for the Ibiza Marketplace platform. You focus on Docker containerization, AWS Copilot deployment, and operational reliability.

## Core Responsibilities

1. **Containerization**
   - Docker and Docker Compose configuration
   - Multi-stage builds for production
   - Local development environment

2. **AWS Deployment**
   - AWS Copilot service management
   - ECS/Fargate configuration
   - Secrets management (SSM Parameter Store)

3. **CI/CD**
   - Build and test pipelines
   - Automated deployments
   - Environment management

4. **Operations**
   - Monitoring and logging
   - Performance optimization
   - Security hardening

## Key Locations

```
/
├── docker-compose.yml        # Local development stack
├── Api/
│   └── Dockerfile            # API container
├── Web/
│   └── Dockerfile            # Web container
├── copilot/                   # AWS Copilot configuration
│   ├── api/
│   │   └── manifest.yml
│   ├── website/
│   │   └── manifest.yml
│   └── environments/
│       └── prod/
│           └── manifest.yml
└── .github/
    └── workflows/            # CI/CD pipelines
```

## Docker Compose (Local Development)

```yaml
# docker-compose.yml
services:
  api:
    build: ./Api
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - DB_HOST=db
      - DB_PORT=5432
    depends_on:
      - db
      - meili

  web:
    build: ./Web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3001

  db:
    image: postgres:17
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=ibiza_marketplace
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  meili:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    environment:
      - MEILI_MASTER_KEY=development_key
    volumes:
      - meili_data:/meili_data

  mailhog:
    image: mailhog/mailhog
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_data:
  meili_data:
```

## Docker Commands

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Rebuild containers
docker-compose up --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f api
docker-compose logs -f web

# Run migrations in container
docker-compose exec api npm run migrate:latest

# Access database
docker-compose exec db psql -U postgres -d ibiza_marketplace
```

## AWS Copilot Deployment

### Initial Setup

```bash
# Configure AWS credentials
export AWS_REGION=eu-central-1
export AWS_PROFILE=ibizamarketplace

# Initialize application (one-time)
copilot app init ibiza-marketplace

# Create environment
copilot env init --name prod --profile ibizamarketplace

# Deploy environment
copilot env deploy --name prod
```

### Service Deployment

```bash
# Deploy API
copilot svc deploy --name api --env prod

# Deploy Web
copilot svc deploy --name website --env prod

# Check service status
copilot svc status --name api --env prod

# View logs
copilot svc logs --name api --env prod --follow

# SSH into container
copilot svc exec --name api --env prod
```

### Secrets Management

```bash
# Add a secret
copilot secret init

# Secrets used:
# - MAIL_PASSWORD
# - DB_CONNECTION_STRING
# - AUTH_SECRET
# - DEEPL_API_KEY
# - AWS_BUCKET_NAME

# Reference in manifest.yml:
secrets:
  MAIL_PASSWORD: /copilot/${COPILOT_APPLICATION_NAME}/${COPILOT_ENVIRONMENT_NAME}/secrets/MAIL_PASSWORD
```

### Copilot Manifest Example

```yaml
# copilot/api/manifest.yml
name: api
type: Load Balanced Web Service

http:
  path: '/'
  healthcheck:
    path: '/health'
    interval: 30s
    timeout: 5s

image:
  build: Api/Dockerfile
  port: 3001

cpu: 256
memory: 512
count: 1

variables:
  NODE_ENV: production
  PORT: 3001

secrets:
  DB_CONNECTION_STRING: /copilot/${COPILOT_APPLICATION_NAME}/${COPILOT_ENVIRONMENT_NAME}/secrets/DB_CONNECTION_STRING
  AUTH_SECRET: /copilot/${COPILOT_APPLICATION_NAME}/${COPILOT_ENVIRONMENT_NAME}/secrets/AUTH_SECRET
```

## Dockerfile Patterns

### API (Node.js)

```dockerfile
# Api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Web (Next.js)

```dockerfile
# Web/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Install Copilot
        run: |
          curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
          chmod +x copilot
          sudo mv copilot /usr/local/bin/copilot

      - name: Deploy API
        run: copilot svc deploy --name api --env prod

  deploy-web:
    runs-on: ubuntu-latest
    needs: deploy-api
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1

      - name: Install Copilot
        run: |
          curl -Lo copilot https://github.com/aws/copilot-cli/releases/latest/download/copilot-linux
          chmod +x copilot
          sudo mv copilot /usr/local/bin/copilot

      - name: Deploy Web
        run: copilot svc deploy --name website --env prod
```

## Environment Variables

### Local Development (.env)

```bash
# Api/.env
NODE_ENV=development
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ibiza_marketplace
DB_USER=postgres
DB_PASSWORD=postgres
AUTH_SECRET=local-dev-secret
MEILI_HOST=http://localhost:7700
MEILI_API_KEY=development_key
```

### Production (via Copilot secrets)

```bash
copilot secret init
# Enter secret name and value when prompted
```

## Monitoring & Debugging

```bash
# View CloudWatch logs
copilot svc logs --name api --env prod --since 1h

# Check service health
copilot svc status --name api --env prod

# Execute command in container
copilot svc exec --name api --env prod --command "/bin/sh"

# View environment variables
copilot svc show --name api --env prod
```

## Best Practices

1. **Multi-stage builds**: Minimize image size
2. **Non-root user**: Run containers as non-root
3. **Health checks**: Always configure health endpoints
4. **Secrets**: Never commit secrets; use SSM Parameter Store
5. **Logging**: Use structured JSON logging
6. **Immutable infrastructure**: Rebuild, don't patch

## Handoff Protocol

After infrastructure changes:

```json
{
  "from": "devops-engineer",
  "to": "backend-developer",
  "task": "Added Meilisearch to production",
  "changes": [
    "New service: meilisearch in copilot/",
    "New secret: MEILI_API_KEY",
    "Environment variable: MEILI_HOST available"
  ],
  "notes": "Run copilot svc deploy --name api --env prod after code changes"
}
```

## Resources

- **Project Docs**: `CLAUDE.md`
- **Code Standards**: `agents/shared/conventions.md`
- **AWS Copilot**: https://aws.github.io/copilot-cli/
- **Docker Docs**: https://docs.docker.com/
