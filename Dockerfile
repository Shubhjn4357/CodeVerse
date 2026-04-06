# CodeVerse: Cloud IDE & Emulator Platform
# Production Baseline: April 2026
# Optimized for Hugging Face Spaces (Debian Bookworm)

FROM docker.io/library/node:20-bookworm-slim@sha256:1e85773c98c31d4fe5b545e4cb17379e617b348832fb3738b22a08f68dec30f3

# 1. System Baseline & Environment Hygiene
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_ROOT_USER_ACTION=ignore
ENV PIP_BREAK_SYSTEM_PACKAGES=true
# HF Spaces use UID 1000 (standard 'node' user)
ENV HOME=/home/node
ENV WORKSPACE_ROOT=/home/node/app/workspaces
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make g++ git git-lfs curl ca-certificates tar unzip bzip2 xz-utils procps net-tools iptables \
    xvfb fluxbox novnc websockify libnss3 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Hugging Face CLI for persistence layer
RUN pip3 install --no-cache-dir "huggingface_hub[cli]"

# Install code-server (Liquid-smooth IDE binary)
RUN curl -fsSL https://code-server.dev/install.sh | sh

# 2. Nix Installation (Optimized for UID 1000)
RUN mkdir -p /nix && chown node:node /nix && \
    mkdir -p /etc/nix && echo "experimental-features = nix-command flakes" > /etc/nix/nix.conf && \
    mkdir -p /home/node/.cache && \
    mkdir -p /home/node/.nix-defexpr/channels && \
    chown -R node:node /home/node /nix /etc/nix

USER node
WORKDIR /home/node

# Use bash for reliable environment sourcing
SHELL ["/bin/bash", "-c"]

# Use the Official Nix Installer (Non-interactive & No-daemon)
RUN export XDG_CACHE_HOME=/home/node/.cache && \
    curl -L https://nixos.org/nix/install | sh -s -- --no-daemon && \
    . /home/node/.nix-profile/etc/profile.d/nix.sh && \
    nix-channel --add https://nixos.org/channels/nixpkgs-unstable nixpkgs && \
    nix-channel --update

ENV PATH="/home/node/.nix-profile/bin:/home/node/.nix-profile/sbin:${PATH}"
ENV NIX_PATH="nixpkgs=/home/node/.nix-defexpr/channels/nixpkgs"

# 3. Application Provisioning
USER root
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app

# Copy package manifest first for better caching
COPY --chown=node:node package*.json ./
USER node
RUN npm install --no-audit --no-fund --quiet --legacy-peer-deps

# Copy rest of the application
USER root
COPY --chown=node:node . .
USER node
RUN npm run build

# 4. Runtime Hardening
ENV PORT=7860
ENV NODE_ENV=production

# Final Permissions Sync for persistence
USER root
RUN mkdir -p /home/node/app/workspaces && \
    mkdir -p /home/node/app/dist && \
    chown -R node:node /home/node/app /home/node

USER node

# Authoritative Entrypoint for HF Spaces April 2026
# Handle ulimit gracefully while launching the custom server
CMD ["sh", "-c", "ulimit -s $(ulimit -Hs) 2>/dev/null || true && node dist/server.js"]
