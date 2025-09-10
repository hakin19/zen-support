# Multi-stage Dockerfile for Aizen vNE Device Agent
# Supports multi-architecture: linux/amd64 and linux/arm64
# Uses Alpine for smaller image size as per spec

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY nx.json ./
COPY tsconfig.base.json ./

# Copy workspace packages
COPY packages/device-agent/package*.json ./packages/device-agent/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies with timeout
RUN npm install --include=dev --fetch-timeout=60000 --fetch-retry-maxtimeout=120000

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/nx.json ./
COPY --from=deps /app/tsconfig.base.json ./

# Copy source code
COPY packages/device-agent ./packages/device-agent
COPY packages/shared ./packages/shared

# Build the application
RUN cd packages/device-agent && npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime dependencies (Alpine packages)
RUN apk add --no-cache \
    iputils \
    bind-tools \
    curl \
    net-tools \
    traceroute \
    ca-certificates \
    && addgroup -g 1001 -S nodejs \
    && adduser -u 1001 -S nodejs -G nodejs

# Copy built application
COPY --from=builder /app/packages/device-agent/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/packages/device-agent/package.json ./

# Create directories for logs and config
RUN mkdir -p /app/logs /app/config \
    && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); });" || exit 1

# Environment variables (defaults)
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    HEARTBEAT_INTERVAL=30000 \
    MOCK_MODE=false \
    API_URL=http://host.docker.internal:3001 \
    DEVICE_ID="" \
    DEVICE_SECRET="" \
    WEBSOCKET_RECONNECT_INTERVAL=5000 \
    WEBSOCKET_MAX_RETRIES=10

# Expose health check port
EXPOSE 3000

# Handle graceful shutdown
STOPSIGNAL SIGTERM

# Security constraints
# Read-only filesystem with specific tmpfs mounts for writable areas
# Capabilities and security options are set in docker-compose.yml

# Start the agent
CMD ["node", "dist/index.js"]