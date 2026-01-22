#!/bin/bash
# Build all BuildForge Docker images

set -e

echo "Building BuildForge Docker images..."

# Build Windows cross-compile image
echo "Building Windows image..."
docker build --platform linux/arm64 -t buildforge/windows-builder:latest -f Dockerfile.windows .

# Build Linux image
echo "Building Linux image..."
docker build --platform linux/arm64 -t buildforge/linux-builder:latest -f Dockerfile.linux .

# Build macOS cross-compile image
echo "Building macOS image..."
docker build --platform linux/arm64 -t buildforge/macos-builder:latest -f Dockerfile.macos .

echo "All images built successfully!"
echo "Windows: buildforge/windows-builder:latest (~800MB)"
echo "Linux: buildforge/linux-builder:latest (~150MB)"
echo "macOS: buildforge/macos-builder:latest (~200MB)"
