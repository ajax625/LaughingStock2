# Step 1: Dependencies & Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code and build Next.js application
COPY . .
RUN mkdir -p public
RUN npx prisma generate
RUN npm run build

# Step 2: Production Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install OpenSSL for Prisma client runtime
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start"]
