# BuildForge Secure Multi-Platform Docker Image
# Full cross-compilation support with security hardening
# Multi-arch: supports both ARM64 and x86_64

FROM debian:bookworm-slim

# Security: Install security updates first
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
    curl ca-certificates git build-essential pkg-config libssl-dev wget \
    gnupg2 xz-utils software-properties-common && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS (latest stable)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g npm@latest && \
    rm -rf /var/lib/apt/lists/*

# Install Rust with minimal profile (latest stable)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal && \
    . /root/.cargo/env && \
    rustup target add x86_64-pc-windows-gnu && \
    rustup update

# Install Wine (stable) + MinGW for Windows cross-compilation
RUN dpkg --add-architecture i386 && \
    mkdir -pm755 /etc/apt/keyrings && \
    wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/debian/dists/bookworm/winehq-bookworm.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends winehq-stable mingw-w64 && \
    rm -rf /var/lib/apt/lists/*

# Install latest Zig for macOS cross-compilation (arch-specific)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        ZIGARCH="aarch64"; \
    else \
        ZIGARCH="x86_64"; \
    fi && \
    curl -L https://ziglang.org/download/0.13.0/zig-linux-${ZIGARCH}-0.13.0.tar.xz | tar -xJ -C /usr/local && \
    mv /usr/local/zig-linux-* /usr/local/zig && \
    ln -s /usr/local/zig/zig /usr/local/bin/zig

# Configure Cargo for cross-compilation
RUN mkdir -p /root/.cargo && \
    echo '[target.x86_64-pc-windows-gnu]\nlinker = "x86_64-w64-mingw32-gcc"\n\n[target.x86_64-apple-darwin]\nlinker = "zig"\nar = "zig"\n' > /root/.cargo/config.toml

# Security hardening: Remove unnecessary packages and clean cache
RUN apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/cache/apt/*

ENV PATH="/root/.cargo/bin:${PATH}"
ENV CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER="x86_64-w64-mingw32-gcc"

WORKDIR /workspace
CMD ["/bin/bash"]
