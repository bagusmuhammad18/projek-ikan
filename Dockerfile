# Pilih base image Node.js (versi LTS yang stabil adalah pilihan baik)
# Pilih versi yang menyertakan OS Debian/Ubuntu (misalnya, -slim atau versi penuh)
# Opsi lain bisa node:20-slim, atau versi spesifik yang Anda inginkan.
FROM node:18-slim

# Set working directory di dalam container
WORKDIR /usr/src/app

# Instal paket sistem yang diperlukan, termasuk MongoDB Database Tools
# Ini adalah bagian penting yang akan menyelesaikan masalah 'mongodump not found'
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg \
    wget \
    curl \
    ca-certificates \
    procps \
 # lsb-release mungkin tidak ada di image slim, jadi 'bullseye' di-hardcode di bawah
 # atau bisa menggunakan: . /etc/os-release && echo "$VERSION_CODENAME"
 # Jika Anda ingin lebih dinamis dan lsb-release ada: apt-get install -y lsb-release && \
 && mkdir -p /etc/apt/keyrings && \
 curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg && \
 # Menggunakan 'bullseye' secara eksplisit karena node:18-slim biasanya berbasis Debian Bullseye.
 # Ganti 'bullseye' dan '7.0' jika base image atau versi MongoDB Tools yang diinginkan berbeda.
 echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/debian bullseye/mongodb-org/7.0 main" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
 apt-get update && \
 apt-get install -y --no-install-recommends mongodb-database-tools && \
 # Bersihkan cache apt untuk mengurangi ukuran image
 apt-get clean && \
 rm -rf /var/lib/apt/lists/*

# Copy package.json dan package-lock.json (atau yarn.lock jika menggunakan Yarn)
COPY package*.json ./

# Install dependensi aplikasi Anda
# --omit=dev digunakan untuk tidak menginstal devDependencies jika ini adalah build produksi.
# Hapus --omit=dev jika Anda memerlukan devDependencies untuk build step (misalnya jika npm run build memerlukan sesuatu dari devDependencies).
RUN npm install --legacy-peer-deps --omit=dev

# Copy sisa kode aplikasi Anda ke working directory
# Pastikan Anda memiliki file .dockerignore untuk mengecualikan node_modules, .git, dll.
COPY . .

# Jika Anda memiliki langkah build (misalnya, untuk TypeScript atau frontend framework yang dibundel dengan backend)
# Contoh: RUN npm run build

# Expose port yang digunakan aplikasi Anda (sesuai dengan PORT di .env dan server.js)
EXPOSE 5000

# Perintah untuk menjalankan aplikasi Anda saat container dimulai
# Ini akan menjalankan file server.js menggunakan node.
CMD [ "node", "server.js" ]