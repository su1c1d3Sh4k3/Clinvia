# Node.js 20 LTS pelo mirror do Google: a VPS de producao perdeu a rota ate o
# registry-1.docker.io (timeout de TCP no 443) e o build parava no primeiro FROM.
# Mesma imagem oficial, outra rede.
FROM mirror.gcr.io/library/node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM mirror.gcr.io/library/node:20-alpine AS runner

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3000

# Start the server
CMD ["serve", "dist", "-s", "-l", "3000"]
