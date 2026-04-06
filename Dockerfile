FROM docker.io/library/node:20-bookworm-slim@sha256:1e85773c98c31d4fe5b545e4cb17379e617b348832fb3738b22a08f68dec30f3

# 1. System Dependencies & Environment Baseline
ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/home/node
ENV WORKSPACE_ROOT=/app/workspaces
ENV ANDROID_SDK_ROOT=/app/android-sdk
ENV PATH="/home/node/.nix-profile/bin:/usr/local/bin:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

# 2. Modern Infrastructure Layer (Optimized for Hugging Face Spaces)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip make g++ git curl ca-certificates tar unzip bzip2 xz-utils \
    openjdk-17-jdk xvfb fluxbox novnc websockify libnss3 libatk-bridge2.0-0 \
    libcups2 libgtk-3-0 procps net-tools iptables \
    && rm -rf /var/lib/apt/lists/*

# 3. code-server Modernization (v4.114.0 - Stable 2026)
RUN curl -fL https://github.com/coder/code-server/releases/download/v4.114.0/code-server-4.114.0-linux-amd64.tar.gz \
    | tar -C /usr/local/lib -xz \
    && ln -s /usr/local/lib/code-server-4.114.0-linux-amd64/bin/code-server /usr/local/bin/code-server

# 4. Determinate Systems Nix Installer (Unprivileged, Single-User)
RUN curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install linux \
    --init none --no-confirm --extra-conf "experimental-features = nix-command flakes" \
    --extra-conf "sandbox = false" \
    && chown -R node:node /nix /home/node

# 5. Advanced Acceleration Layer (Cachix & Hugging Face Hub CLI)
RUN pip3 install --no-cache-dir huggingface-hub --break-system-packages \
    && curl -fL https://cachix.org/api/v1/install | sh

# 6. Android SDK (Studio Preview Engine Integration)
WORKDIR /app
RUN mkdir -p ${ANDROID_SDK_ROOT} && \
    curl -fL https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip -o cmdline.zip && \
    unzip cmdline.zip -d ${ANDROID_SDK_ROOT}/cmdline-tools && \
    mv ${ANDROID_SDK_ROOT}/cmdline-tools/cmdline-tools ${ANDROID_SDK_ROOT}/cmdline-tools/latest && \
    rm cmdline.zip && \
    yes | ${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager --sdk_root=${ANDROID_SDK_ROOT} "platform-tools" "platforms;android-33"

# 7. CodeVerse Application Layer (Strict Production Build)
WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# 8. Final Sanity Check & Build (Strict Targets)
RUN npm run build && \
    mkdir -p ${WORKSPACE_ROOT} && \
    chown -R node:node /app ${WORKSPACE_ROOT}

USER node
EXPOSE 7860

# idx-start signal for boot manager
LABEL idx.studio.version="2026.04"
LABEL idx.optimization.cachix="true"
LABEL idx.optimization.hfsync="true"

CMD ["npm", "run", "start"]
