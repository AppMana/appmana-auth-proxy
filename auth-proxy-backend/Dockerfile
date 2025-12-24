FROM node:22-trixie AS builder

WORKDIR /app
COPY . .

ENV YARN_NODE_LINKER=node-modules

RUN corepack enable
RUN yarn install

# 1. Build the dependency first
RUN yarn workspace @appmana-public/auth-proxy-common build
# 2. Build the backend
RUN yarn workspace @appmana-public/auth-proxy-backend build

# 3. "Package" it: Remove devDependencies so we only keep what's needed for prod
# The workspace-tools plugin is already installed, so we run focus directly
RUN yarn workspaces focus --all --production

# Production stage
FROM node:22-trixie

WORKDIR /app

# 4. Copy the entire pre-packaged application state (node_modules + built code)
# This preserves all symlinks and workspace structures correctly.
COPY --from=builder /app .

# Expose port
EXPOSE 3000

# Set working directory to backend
WORKDIR /app/auth-proxy-backend

# Command to run
CMD ["node", "build/index.js"]