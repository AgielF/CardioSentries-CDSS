# --- Stage 1: Build Target ---
FROM node:18-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Menerima argumen dari GitHub Actions untuk menyuntikkan URL API Backend saat build time
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# --- Stage 2: Production Server ---
FROM nginx:alpine

# Menyalin berkas hasil kompilasi statis dari Stage 1 ke direktori Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Port 80 disesuaikan dengan bendera --port=80 pada skrip deploy Anda
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]