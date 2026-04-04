# Use Node.js LTS (Alpine for smaller image size)
FROM node:20-alpine AS base

# Step 1. Rebuild the source code only when needed
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat python3 make g++ git
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

# Prevent Prisma/Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Increase memory for build
ENV NODE_OPTIONS=--max-old-space-size=8192

# Generate the standalone Next.js build
RUN npm run build

# Step 2. Production image, copy all the files and start next
FROM base AS runner
WORKDIR /app

# Add libc6-compat and other runtimes for native modules (node-pty)
# Also add code-server for Native Isolation Mode (when Docker is missing)
RUN apk add --no-cache libc6-compat python3 make g++ git \
    && npm install -g code-server --unsafe-perm

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# HF Spaces run with UID 1000. Ensure /app belongs to 'node' BEFORE switching users.
# WORKDIR was called as root earlier, so /app is currently root-owned.
RUN chown -R node:node /app
USER node

# Copy needed files and re-install production dependencies
COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

# Copy build artifacts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/dist ./dist

# Final permissions check for workspaces
USER root
RUN mkdir -p workspaces && chown -R node:node /app
USER node

EXPOSE 7860
ENV PORT 7860
ENV HOSTNAME "0.0.0.0"

# Start the custom server that integrates Socket.IO and Next.js
CMD ["node", "dist/server.js"]
