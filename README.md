<p align="left">
  <img src="assets/buildforge-icon.svg" alt="BuildForge Logo" width="64" height="64" />
</p>

# BuildForge

[![Downloads](https://img.shields.io/github/downloads/yyyumeniku/BuildForge/total?style=for-the-badge&logo=github&label=Downloads&color=22c55e)](https://github.com/yyyumeniku/BuildForge/releases)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/yyyumeniku)

A cross-platform node-based build orchestration tool with remote server support!

<!-- TODO: Add screenshot -->
<!-- <img width="3084" height="1964" alt="BuildForge Screenshot" src="https://github.com/user-attachments/assets/..." /> -->

## Features

- **Node-based Workflows** - Visual build pipeline editor with drag-and-drop nodes
- **Remote Build Servers** - Connect to multiple build machines (Linux, macOS, Windows)
- **GitHub Integration** - Authenticate with GitHub, create releases automatically
- **Multiple Simultaneous Builds** - Run builds in parallel across different servers
- **Scheduled Builds** - Set up cron-based build schedules
- **Build History** - Track all builds with detailed logs and status
- **Desktop Notifications** - Get notified when builds complete
- **Cross-platform** - Works on Windows, macOS, and Linux

## Installation

Downloads are available in [releases](https://github.com/yyyumeniku/BuildForge/releases).

## Platform Support

- Windows (fully supported)
- macOS (ARM64 & Intel)
- Linux (AppImage, .deb)

## Quick Start

### Client Setup

1. Download and install BuildForge for your platform
2. Launch the app and log in with your GitHub personal access token
3. Add your build servers
4. Create a project and set up your build workflow
5. Start building!

### Server Setup

Run the BuildForge server on your build machines:

```bash
# Install server
cargo install buildforge-server

# Run with default settings (port 9876)
buildforge-server

# Or specify options
buildforge-server --port 9876 --github-token YOUR_TOKEN --workdir /path/to/builds
```

#### Server Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port` | Port to listen on | 9876 |
| `--github-token` | GitHub token for releases | None |
| `-w, --workdir` | Working directory for builds | Current dir |

## Node Types

BuildForge supports the following node types in your workflows:

| Node | Description |
|------|-------------|
| **Command** | Run a shell command |
| **Script** | Execute a multi-line script |
| **Artifact** | Collect build artifacts using glob patterns |
| **Release** | Create a GitHub release with collected artifacts |

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.70+
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

### Client

```bash
# Clone the repository
git clone https://github.com/yyyumeniku/BuildForge.git
cd BuildForge

# Install dependencies
npm install

# Development
npm run tauri dev

# Build for production
npm run tauri build
```

### Server

```bash
cd server

# Development
cargo run

# Build for production
cargo build --release
```

## Configuration

BuildForge stores configuration in:

- **Windows**: `%APPDATA%\dev.buildforge.app\`
- **macOS**: `~/Library/Application Support/dev.buildforge.app/`
- **Linux**: `~/.config/dev.buildforge.app/`

## Security

Your GitHub token is stored locally and is only sent to:
1. GitHub API for authentication
2. Build servers (when creating releases)

## License

MIT - See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you find BuildForge useful, consider [buying me a coffee](https://buymeacoffee.com/yyyumeniku)!
