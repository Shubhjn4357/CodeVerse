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

# Add libc6-compat to the runner stage as well
RUN apk add --no-cache libc6-compat

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to the non-root user
USER nextjs

EXPOSE 7860

ENV PORT 7860
ENV HOSTNAME "0.0.0.0"

# Note: server.js is created by next build from the standalone output
CMD ["node", "server.js"]
