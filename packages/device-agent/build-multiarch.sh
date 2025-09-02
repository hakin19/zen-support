#!/bin/bash

# Build multi-architecture Docker image for Aizen vNE Device Agent
# Supports both linux/amd64 (development) and linux/arm64 (Raspberry Pi)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="aizen/device-agent"
VERSION="${1:-latest}"
PLATFORMS="linux/amd64,linux/arm64"
BUILDER_NAME="aizen-multiarch-builder"

echo -e "${GREEN}Building multi-architecture Docker image for Device Agent${NC}"
echo -e "${YELLOW}Version: ${VERSION}${NC}"
echo -e "${YELLOW}Platforms: ${PLATFORMS}${NC}"

# Check if Docker buildx is available
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}Error: Docker buildx is not available${NC}"
    echo "Please ensure Docker Desktop is installed or install buildx manually"
    exit 1
fi

# Create or use existing buildx builder
echo -e "${GREEN}Setting up buildx builder...${NC}"
if ! docker buildx ls | grep -q "${BUILDER_NAME}"; then
    echo "Creating new buildx builder: ${BUILDER_NAME}"
    docker buildx create --name "${BUILDER_NAME}" --driver docker-container --bootstrap --use
else
    echo "Using existing buildx builder: ${BUILDER_NAME}"
    docker buildx use "${BUILDER_NAME}"
fi

# Ensure QEMU emulation is set up
echo -e "${GREEN}Ensuring QEMU emulation support...${NC}"
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes &> /dev/null || true

# Build multi-architecture image
echo -e "${GREEN}Building multi-architecture image...${NC}"
cd ../.. # Move to repository root

# Build and load locally (for testing)
if [ "$2" = "--load" ]; then
    echo -e "${YELLOW}Building for local platform only (--load flag)${NC}"
    docker buildx build \
        --builder="${BUILDER_NAME}" \
        --platform="linux/$(uname -m | sed 's/x86_64/amd64/')" \
        -f packages/device-agent/Dockerfile \
        -t "${IMAGE_NAME}:${VERSION}" \
        --load \
        .
# Build and push to registry
elif [ "$2" = "--push" ]; then
    echo -e "${YELLOW}Building and pushing to registry${NC}"
    docker buildx build \
        --builder="${BUILDER_NAME}" \
        --platform="${PLATFORMS}" \
        -f packages/device-agent/Dockerfile \
        -t "${IMAGE_NAME}:${VERSION}" \
        --push \
        .
# Build without pushing (dry run)
else
    echo -e "${YELLOW}Building without pushing (dry run)${NC}"
    docker buildx build \
        --builder="${BUILDER_NAME}" \
        --platform="${PLATFORMS}" \
        -f packages/device-agent/Dockerfile \
        -t "${IMAGE_NAME}:${VERSION}" \
        .
fi

# Inspect the built image
if [ "$2" != "--push" ]; then
    echo -e "${GREEN}Inspecting built image...${NC}"
    docker buildx imagetools inspect "${IMAGE_NAME}:${VERSION}" 2>/dev/null || \
    docker inspect "${IMAGE_NAME}:${VERSION}" 2>/dev/null || \
    echo -e "${YELLOW}Note: Image inspection requires pushing to registry or using --load${NC}"
fi

echo -e "${GREEN}✓ Build complete!${NC}"

# Display usage information
if [ -z "$2" ]; then
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./build-multiarch.sh [version] [--load|--push]"
    echo ""
    echo "Options:"
    echo "  version   Image version tag (default: latest)"
    echo "  --load    Build and load for current platform only"
    echo "  --push    Build and push to Docker registry"
    echo ""
    echo "Examples:"
    echo "  ./build-multiarch.sh                # Dry run"
    echo "  ./build-multiarch.sh latest --load  # Build for local testing"
    echo "  ./build-multiarch.sh v1.0.0 --push  # Build and push to registry"
fi