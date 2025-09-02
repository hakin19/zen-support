# Raspberry Pi Device Agent Emulation

This document explains the Docker container configuration for emulating Raspberry Pi hardware for the Aizen vNE Device Agent.

## Architecture Configuration

### Base Image: Debian Bookworm

- **Changed from**: `node:20-alpine`
- **Changed to**: `node:20-bookworm-slim`
- **Rationale**:
  - Raspberry Pi OS is Debian-based, not Alpine
  - Better compatibility with native Node.js modules
  - Uses glibc (like Pi OS) instead of musl libc
  - Reduces compatibility issues when deploying to real hardware

### Multi-Architecture Support

The image now supports both:

- `linux/amd64` - For development on x86_64 machines
- `linux/arm64` - For Raspberry Pi 4/5 and other ARM64 devices

## Building the Image

### Quick Start

```bash
# Build for local development (current platform only)
./build-multiarch.sh latest --load

# Build multi-arch image (dry run)
./build-multiarch.sh

# Build and push to registry (requires login)
./build-multiarch.sh v1.0.0 --push
```

### Manual Build Commands

```bash
# Setup buildx (one-time)
docker buildx create --name aizen-multiarch --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f packages/device-agent/Dockerfile \
  -t aizen/device-agent:latest \
  ../../

# Build and load for local platform only
docker buildx build \
  --platform linux/$(uname -m | sed 's/x86_64/amd64/') \
  -f packages/device-agent/Dockerfile \
  -t aizen/device-agent:latest \
  --load \
  ../../
```

## Running the Container

### Development Mode (ARM64 Emulation)

```bash
# Run with ARM64 emulation on x86_64
docker-compose -f packages/device-agent/docker-compose.yml up

# The compose file specifies platform: linux/arm64
```

### Production Mode (Auto-detect Platform)

```bash
# Comment out the platform line in docker-compose.yml
# Docker will automatically use the host's native platform
```

## Platform Verification

```bash
# Check container architecture
docker run --rm aizen/device-agent:latest uname -m

# Expected outputs:
# - On x86_64 with emulation: aarch64
# - On Raspberry Pi: aarch64
# - On x86_64 without platform spec: x86_64
```

## Migration to Real Hardware

When deploying to actual Raspberry Pi hardware:

1. **No Dockerfile changes needed** - Bookworm base works on Pi
2. **Remove platform specification** - Let Docker auto-detect
3. **Same image works everywhere** - Multi-arch build ensures compatibility

### Deployment Steps for Raspberry Pi

```bash
# On Raspberry Pi (64-bit OS)
docker pull aizen/device-agent:latest
docker run -d \
  --name device-agent \
  --restart unless-stopped \
  --cap-add NET_RAW \
  --cap-add NET_ADMIN \
  aizen/device-agent:latest
```

## Performance Considerations

### Emulation Overhead

- QEMU emulation adds ~2-5x performance overhead
- Suitable for development and testing
- Not recommended for performance testing

### Native Performance

- Use `--platform linux/amd64` for development speed
- Deploy multi-arch image to Pi for native ARM64 performance
- Build caching significantly speeds up subsequent builds

## Troubleshooting

### Common Issues

1. **Buildx not available**
   - Install Docker Desktop (includes buildx)
   - Or install buildx manually: `docker buildx install`

2. **Emulation not working**
   - Ensure QEMU is installed: `docker run --rm --privileged multiarch/qemu-user-static --reset -p yes`

3. **Slow build times**
   - Expected with emulation
   - Use `--platform linux/amd64` for faster local builds
   - Consider using Docker Build Cloud for native ARM builders

4. **Package compatibility issues**
   - Bookworm packages should work seamlessly
   - Report any Alpine → Bookworm migration issues

## Security Notes

- Container runs as non-root user (nodejs:1001)
- Minimal attack surface with slim base image
- Network capabilities limited to diagnostics only
- Read-only filesystem with specific tmpfs mounts
