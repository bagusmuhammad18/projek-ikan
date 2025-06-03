# Pilih base image Node.js (versi LTS yang stabil adalah pilihan baik)
# Pilih versi yang menyertakan OS Debian/Ubuntu (misalnya, -slim atau versi penuh)
FROM node:18-slim # atau node:20-slim, atau versi lain yang Anda inginkan

# Set working directory di dalam container
WORKDIR /usr/src/app

# Instal paket sistem yang diperlukan, termasuk MongoDB Database Tools
# Ini adalah bagian penting yang akan menyelesaikan masalah 'mongodump not found'
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    wget \
    curl \
    ca-certificates \
    procps \ # lsb-release mungkin tidak ada, procps bisa jadi alternatif atau hardcode codename
 && mkdir -p /etc/apt/keyrings && \
 curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg && \
 echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/7.0 main" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
# Ganti 'bullseye' di atas dengan codename yang sesuai jika Anda tahu base image node Anda menggunakan apa
# atau coba $(lsb_release -cs) jika lsb-release terinstal, atau $(. /etc/os-release && echo "$VERSION_CODENAME")
# Untuk node:18-slim, biasanya Debian Bullseye.
 apt-get update && \
 apt-get install -y --no-install-recommends mongodb-database-tools && \
 # Bersihkan cache apt untuk mengurangi ukuran image
 apt-get clean && \
 rm -rf /var/lib/apt/lists/*

# Copy package.json dan package-lock.json (atau yarn.lock)
COPY package*.json ./

# Install dependensi aplikasi Anda
# Gunakan --omit=dev jika Anda tidak memerlukan devDependencies di produksi
RUN npm install --legacy-peer-deps --omit=dev

# Copy sisa kode aplikasi Anda ke working directory
COPY . .

# Jika Anda memiliki langkah build (misalnya, untuk TypeScript atau frontend framework)
# RUN npm run build

# Expose port yang digunakan aplikasi Anda
EXPOSE 5000

# Perintah untuk menjalankan aplikasi Anda saat container dimulai
# Sesuaikan ini dengan bagaimana Anda menjalankan server (misalnya, "node server.js" atau "npm start")
CMD [ "node", "server.js" ]