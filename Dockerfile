# Build Stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install build dependencies for native node modules (libsodium, opus, etc.)
RUN apk add --no-cache python3 make g++ git

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run db:generate
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Install runtime dependencies for audio streaming (ffmpeg)
RUN apk add --no-cache ffmpeg libtool autoconf automake

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

CMD ["node", "dist/bot.js"]
