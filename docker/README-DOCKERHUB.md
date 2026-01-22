# buildforge Docker Image

**Docker Hub:** [yyyumeniku/buildforge](https://hub.docker.com/r/yyyumeniku/buildforge)

## Quick Start

```bash
docker pull yyyumeniku/buildforge:latest
```

## What's Inside

This is a unified multi-platform build environment for cross-compiling applications for Windows, Linux, and macOS from a single ARM64 container.

### Installed Tools

- **Node.js 20.x** - For JavaScript/TypeScript builds
- **npm, yarn, pnpm** - Package managers
- **Rust 1.x + Cargo** - With x86_64-pc-windows-gnu target
- **Wine + Wine32 + Wine64** - Windows binary execution
- **MinGW-w64** - Windows cross-compilation toolchain
- **Zig 0.11** - macOS cross-compilation
- **Git, curl, build-essential** - Build essentials

### Supported Targets

- ✅ Linux (x86_64-unknown-linux-gnu) - Native
- ✅ Windows (x86_64-pc-windows-gnu) - Cross-compile
- ✅ macOS (x86_64-apple-darwin) - Cross-compile with Zig

## Usage

### Basic Container

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  --platform linux/arm64 \
  yyyumeniku/buildforge:latest \
  bash
```

### Build Example

```bash
# Inside container
cd /workspace/your-project

# Node.js project
npm install
npm run build

# Rust project (Linux native)
cargo build --release

# Rust project (Windows cross-compile)
cargo build --release --target x86_64-pc-windows-gnu
```

### With BuildForge App

The BuildForge desktop app automatically uses this image when you create Docker build containers. No manual setup needed!

## Architecture

**Platform:** linux/arm64 (Apple Silicon optimized)  
**Base:** debian:bookworm-slim  
**Size:** 1.22GB compressed, 5.17GB expanded

## Configuration

### Pre-configured Cargo

The image includes Cargo config at `/root/.cargo/config.toml`:

```toml
[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"

[target.x86_64-apple-darwin]
linker = "zig"
ar = "zig"
```

### Environment Variables

```bash
PATH="/root/.cargo/bin:${PATH}"
CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="x86_64-w64-mingw32-gcc"
```

## Building from Source

```bash
# Clone BuildForge repo
git clone https://github.com/yourusername/BuildForge.git
cd BuildForge

# Build image
docker build --platform linux/arm64 -t buildforge:local .

# Test
docker run --rm buildforge:local node --version
```

## Use Cases

- **Tauri Apps** - Build desktop apps for all platforms
- **Rust CLI Tools** - Cross-compile for Windows/Linux/macOS
- **Electron Apps** - Package for multiple platforms
- **Node.js Apps** - Build and bundle
- **CI/CD** - Automated cross-platform builds

## Examples

### Build Tauri App for Windows

```bash
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  yyyumeniku/buildforge:latest \
  bash -c "source /root/.cargo/env && npm install && npm run tauri build -- --target x86_64-pc-windows-gnu"
```

### Build Rust Binary for Windows

```bash
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  yyyumeniku/buildforge:latest \
  bash -c "source /root/.cargo/env && cargo build --release --target x86_64-pc-windows-gnu"
```

## Performance

### On Apple Silicon (M1/M2/M3)

- **Native ARM64** - No emulation overhead
- **Fast builds** - Optimized for Apple Silicon
- **Parallel builds** - Run multiple containers simultaneously

### Build Times (Typical Tauri App)

- **Linux** (native): ~2-3 minutes
- **Windows** (cross-compile): ~4-5 minutes
- **macOS** (cross-compile): ~3-4 minutes
- **All platforms** (parallel): ~5-6 minutes

## Troubleshooting

### Permission Issues

```bash
# Run with user permissions
docker run --rm \
  -v $(pwd):/workspace \
  -u $(id -u):$(id -g) \
  yyyumeniku/buildforge:latest \
  bash
```

### Cargo Environment

```bash
# Always source Cargo environment
source /root/.cargo/env
```

### Windows Build Failures

```bash
# Ensure MinGW linker is configured
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc
```

## Updates

### Check for Updates

```bash
docker pull yyyumeniku/buildforge:latest
```

### Version History

- **latest** (2026-01-21) - Initial multi-platform release
  - Node.js 20
  - Rust with Windows target
  - Wine + MinGW for Windows builds
  - Zig for macOS cross-compilation

## Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/BuildForge/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/BuildForge/discussions)
- **Docker Hub:** [yyyumeniku/buildforge](https://hub.docker.com/r/yyyumeniku/buildforge)

## License

This image is based on open-source tools and follows their respective licenses:
- Debian: [Debian License](https://www.debian.org/legal/)
- Node.js: [MIT License](https://github.com/nodejs/node/blob/main/LICENSE)
- Rust: [MIT/Apache 2.0](https://github.com/rust-lang/rust)
- Wine: [LGPL](https://www.winehq.org/license)
- Zig: [MIT License](https://github.com/ziglang/zig/blob/master/LICENSE)

---

**Maintained by:** BuildForge Team  
**Last Updated:** January 21, 2026
