# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:22-alpine AS deps

# Enable corepack for pnpm (version 8.x for lockfile v6 compatibility)
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ALL dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================
# Stage 2: Builder
# ============================================
FROM node:22-alpine AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files
COPY . .

# Build the application
RUN pnpm run build

# Prune devDependencies
RUN pnpm prune --prod

# ============================================
# Stage 3: Runner (Production)
# ============================================
FROM node:22-alpine AS runner

WORKDIR /app

# Security: create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ralph

# Copy built output and production dependencies
COPY --from=builder --chown=ralph:nodejs /app/.output ./.output
COPY --from=builder --chown=ralph:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=ralph:nodejs /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=9000
ENV HOST=0.0.0.0

# Create directories for mounted volumes
RUN mkdir -p /data /projects /skills && \
    chown -R ralph:nodejs /data /projects /skills

# Health check (use 127.0.0.1 to avoid IPv6 issues in Alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:9000/ || exit 1

# Switch to non-root user
USER ralph

EXPOSE 9000

# Start the application using nitro server
CMD ["node", ".output/server/index.mjs"]
