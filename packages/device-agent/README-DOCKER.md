# Device Agent Docker Setup

This document provides platform-specific instructions for running the Device Agent in Docker.

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ for running the API and Web services locally
- Redis (included in Docker Compose)

## Platform-Specific Networking

### macOS and Windows

Docker Desktop on macOS and Windows provides `host.docker.internal` out of the box, which allows containers to connect to services running on the host machine.

No additional configuration needed.

### Linux

On Linux, you need to add the `--add-host` flag or use the `extra_hosts` configuration in docker-compose.yml (already included).

The docker-compose file includes:
```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

This maps `host.docker.internal` to the host's gateway IP.

## Quick Start

### 1. Start the API and Web services locally

```bash
# In the root directory
npm run dev:api  # Runs on port 3001
npm run dev:web  # Runs on port 3000
```

### 2. Start Redis and Device Agent

```bash
# Using the complete docker-compose file
docker-compose -f docker-compose.device-agent.yml up

# Or build and run in detached mode
docker-compose -f docker-compose.device-agent.yml up -d --build
```

### 3. Verify the setup

Check Device Agent health:
```bash
curl http://localhost:3000/health
```

Check Redis connection:
```bash
docker exec aizen-redis redis-cli ping
```

## Environment Configuration

Create a `.env` file in the root directory:

```env
# Device identification
DEVICE_ID=dev-agent-001
DEVICE_SECRET=your-secret-key
CUSTOMER_ID=customer-001

# API configuration
API_URL=http://host.docker.internal:3001

# Agent configuration
HEARTBEAT_INTERVAL=30000
LOG_LEVEL=info
NODE_ENV=development
MOCK_MODE=false

# WebSocket configuration
WEBSOCKET_RECONNECT_INTERVAL=5000
WEBSOCKET_MAX_RETRIES=10
```

## Mock Mode

To run the Device Agent in mock mode (without connecting to the real API):

```bash
MOCK_MODE=true docker-compose -f docker-compose.device-agent.yml up
```

In mock mode, the agent:
- Simulates successful authentication
- Generates mock device metrics
- Randomly generates diagnostic commands
- Simulates command execution with realistic output

## Troubleshooting

### Linux: Cannot connect to host services

If the Device Agent cannot connect to the API running on the host:

1. Check if the API is binding to all interfaces:
   ```bash
   # API should listen on 0.0.0.0:3001, not 127.0.0.1:3001
   netstat -tlnp | grep 3001
   ```

2. Check firewall rules:
   ```bash
   # Allow Docker containers to connect to port 3001
   sudo ufw allow from 172.31.0.0/24 to any port 3001
   ```

3. Alternative: Use host network mode (less isolated):
   ```yaml
   network_mode: host
   ```

### macOS/Windows: Slow performance

If you experience slow performance on macOS or Windows:

1. Reduce volume mounts
2. Increase Docker Desktop resources (CPU, Memory)
3. Use delegated volume mounts:
   ```yaml
   volumes:
     - device-logs:/app/logs:delegated
   ```

### Connection refused errors

1. Verify services are running:
   ```bash
   docker ps
   npm run dev:api  # Should show API running on port 3001
   ```

2. Check network connectivity:
   ```bash
   # From inside the container
   docker exec aizen-device-agent-001 ping host.docker.internal
   docker exec aizen-device-agent-001 curl http://host.docker.internal:3001/health
   ```

3. Check logs:
   ```bash
   docker logs aizen-device-agent-001
   docker logs aizen-redis
   ```

## Docker Commands

### Build the image
```bash
docker-compose -f docker-compose.device-agent.yml build
```

### Start services
```bash
docker-compose -f docker-compose.device-agent.yml up
```

### Stop services
```bash
docker-compose -f docker-compose.device-agent.yml down
```

### View logs
```bash
docker-compose -f docker-compose.device-agent.yml logs -f device-agent
```

### Execute commands in container
```bash
docker exec -it aizen-device-agent-001 sh
```

### Clean up
```bash
docker-compose -f docker-compose.device-agent.yml down -v  # Remove volumes too
```

## Multi-Architecture Support

The Dockerfile supports both AMD64 and ARM64 architectures:

```bash
# Build for specific platform
docker buildx build --platform linux/amd64 -t aizen/device-agent:amd64 .
docker buildx build --platform linux/arm64 -t aizen/device-agent:arm64 .

# Build multi-arch image
docker buildx build --platform linux/amd64,linux/arm64 -t aizen/device-agent:latest .
```

## Security Considerations

The Device Agent container runs with:
- Non-root user (nodejs:1001)
- Read-only filesystem
- Minimal capabilities (NET_RAW, NET_ADMIN for network diagnostics)
- No new privileges
- Isolated network
- Health checks for monitoring

## Development Tips

1. **Hot Reload**: For development, mount source code:
   ```yaml
   volumes:
     - ./packages/device-agent/dist:/app/dist:ro
   ```

2. **Debug Mode**: Enable verbose logging:
   ```bash
   LOG_LEVEL=debug docker-compose up
   ```

3. **Network Inspection**: Debug network issues:
   ```bash
   docker network inspect $(docker-compose ps -q device-agent)
   ```

4. **Resource Monitoring**: Check container resources:
   ```bash
   docker stats aizen-device-agent-001
   ```