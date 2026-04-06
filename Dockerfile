FROM docker.io/library/node:20-bookworm-slim@sha256:1e85773c98c31d4fe5b545e4cb17379e617b348832fb3738b22a08f68dec30f3

# 1. System Baseline & Build-Time Acceleration
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/node
ENV WORKSPACE_ROOT=/app/workspaces
ENV ANDROID_SDK_ROOT=/app/android-sdk
ENV PATH="/home/node/.nix-profile/bin:/usr/local/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

# 2. Optimized Layering (Reducing redundancy & Adding Retry Resilience)
# Combine baseline CLI + Desktop UI + OpenJDK to save build time and layers
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make g++ git curl ca-certificates tar unzip bzip2 xz-utils procps net-tools iptables \
    xvfb fluxbox novnc websockify libnss3 libatk-bridge2.0-0 libcups2 libgtk-3-0 \
    openjdk-17-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# 3. IDE Core: code-server (v4.114.0 Stable 2026 - With Retry)
RUN curl --retry 5 --retry-delay 5 -fL https://github.com/coder/code-server/releases/download/v4.114.0/code-server-4.114.0-linux-amd64.tar.gz \
    | tar -C /usr/local/lib -xz \
    && ln -s /usr/local/lib/code-server-4.114.0-linux-amd64/bin/code-server /usr/local/bin/code-server

# 4. Determinate Systems Nix Installer (Unprivileged Resilience - Hardened)
RUN curl --retry 5 --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install linux \
    --init none --no-confirm --no-modify-profile --extra-conf "experimental-features = nix-command flakes" \
    --extra-conf "sandbox = false" \
    && chown -R node:node /nix /home/node

# 5. Advanced Acceleration (Cachix & Hugging Face CLI)
RUN pip3 install --no-cache-dir huggingface-hub --break-system-packages --root-user-action=ignore \
    && . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh \
    && nix profile install nixpkgs#cachix

# 6. Android SDK (Studio Preview Engine Integration - Layer Optimized)
# Using retry-aware downloads for platform tools
WORKDIR /app
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    curl --retry 5 -fL https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip -o cmdline.zip && \
    unzip -q cmdline.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm cmdline.zip && \
    yes | ${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager --sdk_root=${ANDROID_SDK_ROOT} "platform-tools" "platforms;android-33"

# 7. CodeVerse Application (Production Build)
WORKDIR /app
COPY package*.json ./
# Upgrade npm to latest for better resolution and switch to 'install' for lockfile sync
RUN npm install -g npm@11.12.1 && npm install --no-audit --no-fund --quiet

COPY . .

# 8. Final Sanity Check & Build
# Invalidate cache only for application changes
RUN npm run build && \
    mkdir -p ${WORKSPACE_ROOT} && \
    chown -R node:node /app ${WORKSPACE_ROOT}

USER node
EXPOSE 7860

# Metadata Engine Signal
LABEL idx.studio.version="2026.04"
LABEL idx.optimization.cachix="true"
LABEL idx.build.optimized="true"
LABEL hf.dataset.status="verified"

CMD ["npm", "run", "start"]
