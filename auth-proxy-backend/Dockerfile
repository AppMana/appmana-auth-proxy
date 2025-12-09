FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package.json and lockfile (if exists)
COPY package.json yarn.lock* ./
# Copy workspace package.jsons
COPY appmana-auth-proxy/auth-proxy-backend/package.json ./appmana-auth-proxy/auth-proxy-backend/
COPY appmana-auth-proxy/auth-proxy-frontend/package.json ./appmana-auth-proxy/auth-proxy-frontend/
COPY appmana-auth-proxy/auth-proxy-integration-tests/package.json ./appmana-auth-proxy/auth-proxy-integration-tests/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build backend
WORKDIR /app/appmana-auth-proxy/auth-proxy-backend
RUN yarn build

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/appmana-auth-proxy/auth-proxy-backend/package.json ./appmana-auth-proxy/auth-proxy-backend/
COPY --from=builder /app/appmana-auth-proxy/auth-proxy-backend/build ./appmana-auth-proxy/auth-proxy-backend/build

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /app/appmana-auth-proxy/auth-proxy-backend

# Command to run
# Note: Policy file needs to be mounted or provided
CMD ["node", "build/index.js"]
