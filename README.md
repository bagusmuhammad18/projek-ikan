# Marketplace API

Marketplace API adalah backend untuk sistem e-commerce yang dibangun menggunakan **Node.js, Express, dan MongoDB**. API ini menyediakan fitur seperti autentikasi pengguna, manajemen produk, shopping cart, dan order management.

## 🚀 Fitur
- **Autentikasi Pengguna** (Login, Register, Middleware Auth)
- **CRUD Produk** (Tambah, Lihat, Edit, Hapus Produk)
- **Shopping Cart** (Tambah, Hapus, Lihat Produk dalam Keranjang)
- **Order Management** (Checkout, Lihat Order, Update Status Order)

## 🛠️ Instalasi dan Menjalankan Proyek

### 1️⃣ **Kloning Repositori**
```bash
git clone https://github.com/username/marketplace-api.git
cd marketplace-api
```

### 2️⃣ **Instal Dependensi**
```bash
npm install
```

### 3️⃣ **Konfigurasi Environment**
Buat file `.env` di root proyek dan tambahkan konfigurasi berikut:
```env
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/marketplace
(Tanya Bagus untuk mendapatkan MONGO_URI)
```

### 4️⃣ **Menjalankan Server**
```bash
npm run dev
```
Server akan berjalan di `http://localhost:5000`.

## 📌 API Endpoints

### **User Authentication**
| Method | Endpoint | Description |
|--------|---------|-------------|
| `POST` | `/api/users/register` | Register pengguna baru |
| `POST` | `/api/users/login` | Login pengguna |
| `GET`  | `/api/users/profile` | Mendapatkan profil pengguna (Auth Required) |

### **Product Management**
| Method | Endpoint | Description |
|--------|---------|-------------|
| `GET`  | `/api/products` | Mendapatkan semua produk |
| `GET`  | `/api/products/:id` | Mendapatkan detail satu produk |
| `POST` | `/api/products` | Menambahkan produk baru (Auth Required) |
| `PUT`  | `/api/products/:id` | Mengupdate produk (Auth Required) |
| `DELETE` | `/api/products/:id` | Menghapus produk (Auth Required) |

### **Shopping Cart**
| Method | Endpoint | Description |
|--------|---------|-------------|
| `GET`  | `/api/cart` | Mendapatkan isi keranjang pengguna |
| `POST` | `/api/cart` | Menambahkan produk ke keranjang |
| `DELETE` | `/api/cart/:id` | Menghapus produk dari keranjang |

### **Order Management**
| Method | Endpoint | Description |
|--------|---------|-------------|
| `POST` | `/api/orders` | Checkout order baru |
| `GET`  | `/api/orders` | Mendapatkan semua order pengguna |
| `GET`  | `/api/orders/:id` | Mendapatkan detail satu order |
| `PUT`  | `/api/orders/:id` | Update status order |

## 🔗 Teknologi yang Digunakan
- **Node.js** & **Express.js** – Backend framework
- **MongoDB** & **Mongoose** – Database NoSQL
- **JWT (JSON Web Token)** – Autentikasi pengguna
- **Multer & Sharp** – Upload dan pemrosesan gambar
