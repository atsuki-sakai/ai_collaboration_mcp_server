# Multi-stage Docker build for Claude Code AI Collaboration MCP Server
# Optimized for production deployment

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:18-alpine AS runtime

# Set environment variables
ENV NODE_ENV=production
ENV TINI_VERSION=v0.19.0

# Add tini for proper init handling
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static-amd64 /tini
RUN chmod +x /tini

# Create app directory and user
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@8 && \
    pnpm install --prod --frozen-lockfile && \
    npm cache clean --force && \
    rm -rf /root/.npm /root/.pnpm-store

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config

# Create directories for logs and cache
RUN mkdir -p /app/logs /app/cache && \
    chown -R mcp:nodejs /app

# Switch to non-root user
USER mcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Expose port (if using non-stdio protocol)
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["/tini", "--"]

# Default command
CMD ["node", "dist/index.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="Claude Code AI Collaboration MCP Server"
LABEL org.opencontainers.image.description="AI collaboration server with MCP protocol support"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="Claude Code AI Collaboration Team"
LABEL org.opencontainers.image.source="https://github.com/claude-code-ai-collab/mcp-server"
LABEL org.opencontainers.image.licenses="MIT"