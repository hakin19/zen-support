# SSL/HTTPS Development Setup Guide

## Overview

This guide covers the setup and configuration of SSL/TLS certificates for local HTTPS development in the Aizen vNE project. Using HTTPS in development ensures parity with production environments and enables testing of secure features like WebSockets over WSS, secure cookies, and service-to-service TLS communication.

## Quick Start

```bash
# 1. Install mkcert (if not already installed)
brew install mkcert  # macOS
# or: sudo apt install libnss3-tools && brew install mkcert  # Linux

# 2. Run the SSL setup script
npm run ssl:setup

# 3. Update your hosts file
./scripts/update-hosts.sh

# 4. Start services with SSL
npm run dev:ssl
```

## Architecture

### Certificate Management

- **Tool**: mkcert - A simple tool for making locally-trusted development certificates
- **Location**: `infrastructure/ssl/`
- **Coverage**: Wildcard certificate for `*.aizen.local` and specific service domains
- **Validity**: 2+ years from generation

### Service Configuration

| Service | HTTP Port | HTTPS Port | Domain |
|---------|-----------|------------|--------|
| API Gateway | 3000 | 3443 | api.aizen.local |
| Web Portal | 3001 | 3444 | app.aizen.local |
| Device Agent | 3002 | 3445 | device.aizen.local |
| AI Orchestrator | 3003 | 3446 | ai.aizen.local |

## Detailed Setup Instructions

### 1. Install mkcert

#### macOS
```bash
brew install mkcert
brew install nss  # For Firefox support
```

#### Linux
```bash
# Install certutil
sudo apt install libnss3-tools  # Debian/Ubuntu
# or
sudo yum install nss-tools      # RHEL/CentOS

# Install mkcert
brew install mkcert
```

#### Windows
```powershell
choco install mkcert
# or
scoop install mkcert
```

### 2. Generate SSL Certificates

```bash
# Run the automated setup script
npm run ssl:setup
```

This script will:
1. Install the local Certificate Authority (CA)
2. Generate SSL certificates for all services
3. Create `.env.ssl` with SSL configuration
4. Update `.gitignore` to exclude certificates

#### Manual Certificate Generation

If you prefer manual setup:

```bash
# Install local CA
mkcert -install

# Create SSL directory
mkdir -p infrastructure/ssl
cd infrastructure/ssl

# Generate certificates
mkcert aizen.local "*.aizen.local" \
  api.aizen.local app.aizen.local \
  device.aizen.local ai.aizen.local \
  localhost 127.0.0.1

# Rename to standard names
mv aizen.local+7.pem cert.pem
mv aizen.local+7-key.pem key.pem

# Set permissions
chmod 644 cert.pem
chmod 600 key.pem
```

### 3. Configure DNS Resolution

Add the following entries to your `/etc/hosts` file:

```bash
# Automated
./scripts/update-hosts.sh

# Or manually edit
sudo nano /etc/hosts
```

Add these lines:
```
# Aizen vNE Development
127.0.0.1 aizen.local
127.0.0.1 api.aizen.local
127.0.0.1 app.aizen.local
127.0.0.1 device.aizen.local
127.0.0.1 ai.aizen.local
```

### 4. Environment Configuration

The SSL setup creates `.env.ssl` with the following variables:

```bash
# SSL Certificate Paths
SSL_CERT_PATH=/app/ssl/cert.pem
SSL_KEY_PATH=/app/ssl/key.pem

# HTTPS Configuration
HTTPS_ENABLED=true
NODE_TLS_REJECT_UNAUTHORIZED=0  # Development only

# Service URLs (HTTPS)
API_URL=https://api.aizen.local:3443
WEB_URL=https://app.aizen.local:3444
```

Merge these into your `.env` file or source them:
```bash
source .env.ssl
```

## Running Services with HTTPS

### Docker Compose

```bash
# Start with SSL configuration
npm run dev:ssl

# Or manually with docker-compose
docker-compose -f infrastructure/docker/docker-compose.yml \
              -f infrastructure/docker/docker-compose.ssl.yml up
```

### Individual Services

Each service can be configured to use HTTPS by setting environment variables:

```bash
HTTPS_ENABLED=true \
SSL_CERT_PATH=./infrastructure/ssl/cert.pem \
SSL_KEY_PATH=./infrastructure/ssl/key.pem \
npm run dev:api
```

## Service Implementation

### Using the Shared HTTPS Utility

```typescript
import express from 'express';
import { createServers, startServers, getServerConfig } from '@aizen/shared';

const app = express();

// Configure your Express app
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get server configuration
const config = getServerConfig();

// Create HTTP and HTTPS servers
const servers = createServers({
  app,
  port: config.httpPort,
  httpsPort: config.httpsPort,
  httpsEnabled: config.httpsEnabled
});

// Start servers
startServers(servers, config.httpPort, config.httpsPort)
  .then(() => {
    console.log('Servers started successfully');
  })
  .catch(error => {
    console.error('Failed to start servers:', error);
    process.exit(1);
  });
```

## Certificate Management

### Renewing Certificates

```bash
# Renew certificates (keeps backups)
npm run ssl:renew
```

### Validating SSL Setup

```bash
# Run validation script
npm run ssl:validate
```

This checks:
- mkcert installation
- CA trust status
- Certificate validity
- DNS configuration
- Environment variables

### Troubleshooting

#### Certificate Not Trusted

If browsers show certificate warnings:

1. Ensure CA is installed:
   ```bash
   mkcert -install
   ```

2. Restart your browser

3. Clear browser cache and cookies

#### Connection Refused

1. Check if services are running:
   ```bash
   docker ps
   ```

2. Verify ports are not in use:
   ```bash
   lsof -i :3443  # Check HTTPS port
   ```

3. Check firewall settings

#### DNS Resolution Issues

1. Verify hosts file entries:
   ```bash
   cat /etc/hosts | grep aizen
   ```

2. Clear DNS cache:
   ```bash
   # macOS
   sudo dscacheutil -flushcache
   
   # Linux
   sudo systemd-resolve --flush-caches
   ```

## Security Considerations

### Development Only Settings

The following settings are for development only and must NOT be used in production:

- `NODE_TLS_REJECT_UNAUTHORIZED=0` - Disables certificate validation
- Self-signed certificates from mkcert
- Permissive CORS policies
- Debug logging of sensitive data

### Production Requirements

For production environments:

1. Use certificates from a trusted CA (Let's Encrypt, etc.)
2. Enable strict TLS validation
3. Implement proper certificate rotation
4. Use secure cipher suites
5. Enable HSTS headers
6. Implement certificate pinning for mobile apps

## Testing HTTPS

### Manual Testing

```bash
# Test API endpoint
curl -k https://api.aizen.local:3443/health

# Test with certificate validation
curl --cacert infrastructure/ssl/cert.pem \
     https://api.aizen.local:3443/health
```

### Automated Testing

```typescript
// In your tests
import https from 'https';
import fs from 'fs';

const agent = new https.Agent({
  ca: fs.readFileSync('./infrastructure/ssl/cert.pem')
});

const response = await fetch('https://api.aizen.local:3443/health', {
  agent
});
```

## WebSocket Configuration

For WebSocket connections over WSS:

```typescript
// Client-side
const ws = new WebSocket('wss://api.aizen.local:3443/ws');

// Server-side (with the shared utility)
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({
  server: servers.httpsServer, // Use HTTPS server from createServers()
  path: '/ws'
});
```

## CI/CD Considerations

### GitHub Actions

For CI/CD pipelines, use HTTP or mock certificates:

```yaml
env:
  HTTPS_ENABLED: false
  NODE_ENV: test
```

### Docker Build

Certificates are not included in Docker images. They're mounted at runtime:

```yaml
volumes:
  - ./infrastructure/ssl/cert.pem:/app/ssl/cert.pem:ro
  - ./infrastructure/ssl/key.pem:/app/ssl/key.pem:ro
```

## Additional Resources

- [mkcert Documentation](https://github.com/FiloSottile/mkcert)
- [Node.js HTTPS Module](https://nodejs.org/api/https.html)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Docker TLS Configuration](https://docs.docker.com/engine/security/protect-access/)

## Support

For issues or questions:
1. Run `npm run ssl:validate` to check your setup
2. Check the troubleshooting section above
3. Review logs in Docker: `docker-compose logs -f`
4. Contact the development team