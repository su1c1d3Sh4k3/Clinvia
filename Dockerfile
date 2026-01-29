# Use Node.js 20 LTS from Docker Hub mirror
FROM node:20-alpine@sha256:2d5e8a8a51bc341fd5f2eed6d91455c3a3d147e91a14298fc564b5dc519c1666 AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with retry and timeout settings
RUN npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retries 5 && \
    npm ci --no-audit --prefer-offline || npm ci --no-audit

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage - use same digest
FROM node:20-alpine@sha256:2d5e8a8a51bc341fd5f2eed6d91455c3a3d147e91a14298fc564b5dc519c1666 AS runner

WORKDIR /app

# Install serve globally with retry
RUN npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retries 5 && \
    npm install -g serve --prefer-offline || npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start the server
CMD ["serve", "dist", "-s", "-l", "3000"]
