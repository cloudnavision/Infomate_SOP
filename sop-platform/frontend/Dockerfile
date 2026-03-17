# ============================================================
# SOP Platform — Frontend Dockerfile
# Stage 1: dev  — Vite dev server with hot reload
# Stage 2: build — npm run build → /app/dist
# Stage 3: prod  — Nginx serving static assets
# ============================================================

# ── Stage 1: dev ─────────────────────────────────────────
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ── Stage 2: build ───────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 3: prod — Nginx ────────────────────────────────
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
