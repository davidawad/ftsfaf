FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build the frontend
RUN bun run build

# Production image
FROM oven/bun:1
WORKDIR /app

# Copy built assets and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package.json ./

# Install production dependencies only
RUN bun install --production --frozen-lockfile

# Expose port
EXPOSE 9482

# Start the dashboard server
CMD ["bun", "run", "server/index.ts"]
