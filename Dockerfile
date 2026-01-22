# BuildForge Multi-Platform Docker Image
# Single image with all cross-compilation tools for Windows, Linux, and macOS
# Optimized for ARM64 Apple Silicon

FROM --platform=linux/arm64 debian:bookworm-slim AS base

# Install common dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git build-essential pkg-config libssl-dev wget \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Rust with minimal profile
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal && \
    . /root/.cargo/env && \
    rustup target add x86_64-pc-windows-gnu

# Install latest Wine stable and MinGW for Windows cross-compilation
RUN dpkg --add-architecture i386 && \
    mkdir -pm755 /etc/apt/keyrings && \
    wget https://dl.winehq.org/wine-builds/winehq.key && \
    mv winehq.key /etc/apt/keyrings/winehq-archive.key && \
    wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/debian/dists/bookworm/winehq-bookworm.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        wine wine32 wine64 mingw-w64 && \
    rm -rf /var/lib/apt/lists/*

# Install latest Zig for macOS cross-compilation
RUN curl -L https://ziglang.org/download/0.13.0/zig-linux-aarch64-0.13.0.tar.xz | tar -xJ -C /usr/local && \
    mv /usr/local/zig-linux-aarch64-* /usr/local/zig && \
    ln -s /usr/local/zig/zig /usr/local/bin/zig

# Configure Cargo for cross-compilation
RUN mkdir -p /root/.cargo && \
    echo '[target.x86_64-pc-windows-gnu]\nlinker = "x86_64-w64-mingw32-gcc"\n\n[target.x86_64-apple-darwin]\nlinker = "zig"\nar = "zig"\n' > /root/.cargo/config.toml

ENV PATH="/root/.cargo/bin:${PATH}"
ENV CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="x86_64-w64-mingw32-gcc"

WORKDIR /workspace
CMD ["/bin/bash"]
