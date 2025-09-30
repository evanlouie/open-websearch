# Use official Bun base image
FROM oven/bun:1-alpine

# Set working directory
WORKDIR /app

# Copy package.json and bun.lockb
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src

# Create non-root user
RUN addgroup -g 1001 -S bunuser && \
    adduser -S bunuser -u 1001

# Change file ownership
RUN chown -R bunuser:bunuser /app
USER bunuser

# Set environment variables
ENV NODE_ENV=production
# Default port setting, can be overridden by deployment environment
ENV PORT=3000

# Expose port (using ARG allows override at build time)
EXPOSE ${PORT}

# Start command
CMD ["bun", "src/index.ts"]
