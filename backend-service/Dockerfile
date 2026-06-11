FROM node:18-slim

WORKDIR /app

# Salin package manager manifest
COPY package*.json ./

# Hanya install production dependencies untuk efisiensi ukuran image
RUN npm install --only=production

# Salin kode aplikasi
COPY . .

# Cloud Run menggunakan port default 8080
EXPOSE 8080

# Jalankan aplikasi menggunakan port dari environment variable Cloud Run
CMD ["node", "server.js"]