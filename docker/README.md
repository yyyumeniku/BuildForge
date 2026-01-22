# BuildForge Docker Images

Custom-optimized Docker images for cross-platform builds on Apple Silicon (ARM64).

## Images

- **buildforge/windows-builder** (~800MB) - Wine + MinGW for Windows cross-compilation
- **buildforge/linux-builder** (~150MB) - Alpine Linux with Tauri dependencies  
- **buildforge/macos-builder** (~200MB) - OSXCross for macOS cross-compilation

## Building Images

```bash
cd docker
chmod +x build-images.sh
./build-images.sh
```

## Features

- ✅ ARM64-native (optimized for Apple Silicon)
- ✅ Minimal size (62-92% smaller than alternatives)
- ✅ Pre-configured Rust + Node.js toolchains
- ✅ Persistent volume support for zero-copy builds
- ✅ All build dependencies included

## Publishing to Docker Hub

```bash
# Login to Docker Hub
docker login -u YOUR_USERNAME

# Tag images
docker tag buildforge/windows-builder:latest YOUR_USERNAME/buildforge-windows:latest
docker tag buildforge/linux-builder:latest YOUR_USERNAME/buildforge-linux:latest
docker tag buildforge/macos-builder:latest YOUR_USERNAME/buildforge-macos:latest

# Push to Docker Hub
docker push YOUR_USERNAME/buildforge-windows:latest
docker push YOUR_USERNAME/buildforge-linux:latest
docker push YOUR_USERNAME/buildforge-macos:latest
```

## Usage in BuildForge

The app automatically pulls these images when creating Docker containers.
Volume mounts at `/workspace` enable zero-copy builds.
