FROM node:22-trixie AS builder

WORKDIR /app
COPY . .

ENV YARN_NODE_LINKER=node-modules

RUN corepack enable
RUN yarn install
RUN yarn workspace @appmana-public/auth-proxy-backend build

# Production stage
FROM node:22-trixie

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/auth-proxy-backend/package.json ./auth-proxy-backend/
COPY --from=builder /app/auth-proxy-backend/build ./auth-proxy-backend/build

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /app/auth-proxy-backend

# Command to run
# Note: Policy file needs to be mounted or provided
CMD ["node", "build/index.js"]
