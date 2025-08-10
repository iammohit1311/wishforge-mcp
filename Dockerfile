# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime image
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Copy build output
COPY --from=base /app/build ./build

# Health and port
EXPOSE 8080
ENV PORT=8080

# Set a default owner phone (override in deploy)
ENV OWNER_PHONE=919998881729

CMD ["node", "build/http.js"] 