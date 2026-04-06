# Base image with full glibc support (Bookworm Slim)
# Alpine (musl) is incompatible with code-server's pre-compiled binaries (fcntl64 symbol error)
FROM node:20-bookworm-slim AS base

# Install build tools and compatibility layers for native modules (node-pty)
# Also add code-server for Native Isolation Mode (when Docker is missing)
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
    && rm -rf /var/lib/apt/lists/* \
    && curl -fL https://github.com/coder/code-server/releases/download/v4.96.2/code-server-4.96.2-linux-amd64.tar.gz \
    | tar -C /usr/local/lib -xz \
    && mv /usr/local/lib/code-server-4.96.2-linux-amd64 /usr/local/lib/code-server \
    && ln -s /usr/local/lib/code-server/bin/code-server /usr/local/bin/code-server

# Step 1. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i; \
  elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  else echo "Lockfile not found." && npm i; \
  fi

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
# Use --chown=node:node to prevent root ownership of copied files
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
