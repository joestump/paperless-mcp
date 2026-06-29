# Builder stage
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts so the `prepare` (build) lifecycle script does not run here:
# src/ hasn't been copied yet, so tsc would have nothing to compile. We build
# explicitly after copying the sources.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app
COPY --from=builder /app/build .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

EXPOSE 3000
ENTRYPOINT [ "node", "index.js", "--http", "--port", "3000" ]
