FROM node:20-slim AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
# npm ci installs exactly what package-lock.json pins and fails loudly on drift.
# (`--frozen-lockfile` is a yarn/pnpm flag; npm ignored it, so the previous
# command silently fell through to an unpinned `npm install`.)
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Create .env file for build (required for Prisma and NextAuth)
RUN echo "DATABASE_URL=file:/app/data/tablo.db" > .env && \
    echo "NEXTAUTH_SECRET=build-secret" >> .env && \
    echo "NEXTAUTH_URL=http://localhost:3000" >> .env

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y openssl wget sqlite3 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --home /home/nextjs nextjs

# Set HOME for npm/npx to work properly
ENV HOME=/home/nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma client for runtime and seed SQL
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@libsql ./node_modules/@libsql
# docker-entrypoint.sh hashes ADMIN_INITIAL_PASSWORD with bcryptjs when it creates
# the initial admin account, so it must resolve from /app at runtime.
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Copy and setup entrypoint script
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
RUN chown nextjs:nodejs ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/data/tablo.db"

# Use entrypoint script for auto-initialization
ENTRYPOINT ["./docker-entrypoint.sh"]
