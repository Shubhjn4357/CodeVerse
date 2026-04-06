# CodeVerse: Cloud IDE & Emulator Platform
# Production Baseline: April 2026
# Optimized for Hugging Face Spaces (Debian Bookworm)

FROM docker.io/library/node:20-bookworm-slim@sha256:1e85773c98c31d4fe5b545e4cb17379e617b348832fb3738b22a08f68dec30f3

# 1. System Baseline & Environment Hygiene
ENV DEBIAN_FRONTEND=noninteractive
ENV PIP_ROOT_USER_ACTION=ignore
ENV PIP_BREAK_SYSTEM_PACKAGES=true
ENV HOME=/home/nodejs
ENV WORKSPACE_ROOT=/home/nodejs/app/workspaces
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make g++ git curl ca-certificates tar unzip bzip2 xz-utils procps net-tools iptables \
    xvfb fluxbox novnc websockify libnss3 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# 2. Nix & Cachix Installation (2026 Multi-User Stable)
RUN useradd -m -s /bin/bash nodejs && \
    mkdir -p /nix && chown nodejs /nix && \
    mkdir -p /etc/nix && echo "experimental-features = nix-command flakes" > /etc/nix/nix.conf

USER nodejs
WORKDIR /home/nodejs

RUN curl -L https://nixos.org/nix/install | sh -s -- --no-daemon && \
    . ~/.nix-profile/etc/profile.d/nix.sh && \
    nix profile add nixpkgs#cachix nixpkgs#nix nixpkgs#cacert

ENV PATH="/home/nodejs/.nix-profile/bin:/home/nodejs/.nix-profile/sbin:${PATH}"
ENV NIX_PATH="nixpkgs=https://github.com/NixOS/nixpkgs/archive/master.tar.gz"

# 3. Application Provisioning
USER root
WORKDIR /app
COPY package*.json ./
RUN npm install -g npm@11.12.1 && npm install --no-audit --no-fund --quiet --legacy-peer-deps

COPY . .
RUN npm run build

# 4. Runtime Hardening
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

# Ensure workspaces are writable in the Space
RUN mkdir -p /home/nodejs/app/workspaces && chown -R nodejs:nodejs /home/nodejs/app /app

# Satisfy system limits for Nix & high-concurrency Node.js (April 2026)
USER nodejs
CMD ["sh", "-c", "ulimit -s 65536 && npm start"]
