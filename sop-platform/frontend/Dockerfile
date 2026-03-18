# ============================================================
# SOP Platform — Frontend Dockerfile
# Stage 1: dev   — Vite dev server with hot reload
# Stage 2: build — npm run build → /app/dist
# Stage 3: prod  — Lightweight static file server (no nginx)
#
# Cloudflare Tunnel proxies localhost:5173 externally.
# The frontend calls the API directly via VITE_API_URL.
# ============================================================

# ── Stage 1: dev ─────────────────────────────────────────
FROM node:20-slim AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Stage 2: build ───────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: prod — static file server ───────────────────
FROM node:20-slim AS prod
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "dist", "-l", "5173", "-s"]
