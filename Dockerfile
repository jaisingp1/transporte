# Stage 1: Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


# Stage 2: Run the backend with TSX
FROM node:20-alpine

WORKDIR /app

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy source code
COPY . .

# Install all dependencies (including dev) so tsx works
RUN npm install

# Ensure the 'node' user owns the app directory (for SQLite write permissions)
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "run", "start:server"]
