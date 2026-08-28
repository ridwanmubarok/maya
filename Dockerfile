# Build Stage
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# Install build dependencies for Prisma and native packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

# Use --include=dev to guarantee all devDependencies (TypeScript, Prisma CLI) install cleanly
RUN --mount=type=cache,target=/root/.npm \
    npm install --include=dev

COPY . .

RUN npm run db:generate
RUN npm run build

# Prune devDependencies for clean production artifact
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

# Production Stage
FROM node:22-slim

WORKDIR /usr/src/app

# Install runtime dependencies for audio streaming (ffmpeg, python3, yt-dlp) and Prisma database client (openssl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    openssl \
    ca-certificates \
    curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

# Copy dependencies and dist output directly from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/bin ./bin

EXPOSE 3000

CMD ["node", "dist/bot.js"]
