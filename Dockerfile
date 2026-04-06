# Base image with full glibc support (Bookworm Slim)
# Alpine (musl) is incompatible with code-server's pre-compiled binaries (fcntl64 symbol error)
FROM node:20-bookworm-slim AS base

# Install build tools and compatibility layers for native modules (node-pty)
# Also add code-server for Native Isolation Mode (when Docker is missing)
# And the real implementation of Docker, Android, X11, and Desktop bridge
RUN apt-get update && apt-get install -y \
    libc6 \
    libstdc++6 \
    python3 \
    make \
    g++ \
    git \
    curl \
    ca-certificates \
    tar \
    unzip \
    openjdk-17-jdk \
    xvfb \
    fluxbox \
    novnc \
    websockify \
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgtk-3-0 \
    # Docker Client and Daemon (for build-time environment availability)
    docker.io \
    # NIX Support (Declarative Environments)
    xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fL https://github.com/coder/code-server/releases/download/v4.96.2/code-server-4.96.2-linux-amd64.tar.gz \
    | tar -C /usr/local/lib -xz \
    && mv /usr/local/lib/code-server-4.96.2-linux-amd64 /usr/local/lib/code-server \
    && ln -s /usr/local/lib/code-server/bin/code-server /usr/local/bin/code-server

# Install Nix for Unprivileged Usage
# Single-user mode without root, configured for /nix
RUN mkdir -p /nix && chown node:node /nix
USER node
RUN curl -L https://nixos.org/nix/install | sh -s -- --no-daemon
ENV PATH="/home/node/.nix-profile/bin:/home/node/.nix-profile/sbin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV NIX_PATH="nixpkgs=https://github.com/NixOS/nixpkgs/archive/master.tar.gz"

USER root
# Install Android SDK Command Line Tools
ENV ANDROID_SDK_ROOT /app/android-sdk
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools \
    && curl -fL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o cmdline-tools.zip \
    && unzip cmdline-tools.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools \
    && mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest \
    && rm cmdline-tools.zip

ENV PATH ${PATH}:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools

# Step 1. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm i --omit=dev

# Copy source code and build
COPY . .

# Prevent Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1
# Increase memory for build
ENV NODE_OPTIONS=--max-old-space-size=8192

# Build Next.js and then compile the custom server.ts
RUN npm run build

# Step 2. Production image, copy all the files and start next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# HF Spaces run with UID 1000. Ensure /app belongs to 'node'
RUN chown -R node:node /app

# Switch to node user early for security and to allow copying directly as node
USER node

# Copy needed files with correct ownership to avoid mass chown later
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy build artifacts with correct ownership
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node --from=builder /app/public ./public
COPY --chown=node:node --from=builder /app/dist ./dist

# Create workspaces directory with user node
RUN mkdir -p /app/workspaces

EXPOSE 7860
ENV PORT 7860
ENV HOSTNAME "0.0.0.0"
ENV AUTH_TRUST_HOST "true"

# Start the custom server that integrates Socket.IO and Next.js
CMD ["node", "dist/server.js"]
