FROM python:3.10-slim

WORKDIR /app

# Install dependencies terlebih dahulu (pemanfaatan Docker layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Menyalin seluruh source code
COPY . .

# Cloud Run mendengarkan port secara dinamis via env PORT, default 8080
EXPOSE 8080

# Jalankan Uvicorn dengan port 8080 sesuai standar Cloud Run
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]