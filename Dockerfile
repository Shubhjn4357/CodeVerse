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
    python3 python3-pip make g++ git curl ca-certificates tar unzip bzip2 xz-utils procps net-tools iptables \
    xvfb fluxbox novnc websockify libnss3 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# 2. Nix & Cachix Installation (Optimized for UID 1000)
RUN mkdir -p /nix && chown node /nix && \
    mkdir -p /etc/nix && echo "experimental-features = nix-command flakes" > /etc/nix/nix.conf

USER node
WORKDIR /home/node

# Use bash for reliable environment sourcing
SHELL ["/bin/bash", "-c"]

RUN ulimit -s $(ulimit -Hs) 2>/dev/null || true && \
    curl -L https://nixos.org/nix/install | sh -s -- --no-daemon && \
    . /home/node/.nix-profile/etc/profile.d/nix.sh && \
    /home/node/.nix-profile/bin/nix profile add nixpkgs#cachix nixpkgs#nix nixpkgs#cacert

ENV PATH="/home/node/.nix-profile/bin:/home/node/.nix-profile/sbin:${PATH}"
ENV NIX_PATH="nixpkgs=https://github.com/NixOS/nixpkgs/archive/master.tar.gz"

# 3. Application Provisioning
USER root
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm install --no-audit --no-fund --quiet --legacy-peer-deps

COPY --chown=node:node . .
RUN npm run build

# 4. Runtime Hardening
ENV PORT=7860
ENV NODE_ENV=production

# Final Permissions Sync
RUN mkdir -p /home/node/app/workspaces && \
    mkdir -p /home/node/app/dist && \
    chown -R node:node /home/node/app /app

USER node

# Authoritative Entrypoint for HF Spaces April 2026
# Gracefully handle ulimit while setting production stack limits
CMD ["sh", "-c", "ulimit -s $(ulimit -Hs) 2>/dev/null || true && node dist/server.js"]
