# Build Stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/

# Force NODE_ENV=development to ensure devDependencies (tsc, prisma) are installed
RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm install

COPY . .

RUN npm run db:generate
RUN npm run build

# Prune devDependencies to keep node_modules minimal
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev

# Production Stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Install runtime dependencies for audio streaming (ffmpeg)
RUN apk add --no-cache ffmpeg

COPY package*.json ./
COPY prisma ./prisma/

# Copy dependencies and dist output directly from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/bot.js"]
