# Stage 1: Build the frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Run the backend
FROM node:20-alpine

WORKDIR /app

# Copy built frontend from the builder stage
COPY --from=builder /app/dist ./dist

# Copy backend source code and package files
COPY package*.json ./
COPY server ./server
COPY scripts ./scripts
COPY i18n.ts ./i18n.ts
COPY types.ts ./types.ts
COPY .env.local.example ./.env.local.example
COPY metadata.json ./metadata.json
COPY tsconfig.json ./tsconfig.json
COPY vite.config.ts ./vite.config.ts
COPY index.tsx ./index.tsx
COPY index.html ./index.html
COPY index.css ./index.css
COPY App.tsx ./App.tsx
COPY components ./components
COPY public ./public # Assuming there might be static assets in a public folder for Vite

RUN npm install --omit=dev

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["npm", "run", "start:server"]
