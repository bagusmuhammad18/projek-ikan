// PROYEK-IKAN/server.js
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

// Import routes
const productRoutes = require("./routes/productRoutes");
const userRoutes = require("./routes/userRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const statsRoutes = require("./routes/statsRoutes");
// <<==== IMPORT RUTE ADMINISTRASI DATABASE BARU ====>>
const dbAdminRoutes = require("./routes/dbAdminRoutes");

// Import Swagger setup
const swaggerDocs = require("./docs/swagger");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware untuk CORS dinamis
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://iwak-seven.vercel.app",
    "http://localhost:5000",
    "https://siphiko.vercel.app",
    "https://benihikan.surakarta.go.id",
    // Tambahkan origin frontend Anda yang lain jika ada
  ];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH" // Tambahkan PATCH jika digunakan
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept" // Tambahkan header umum lainnya
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200); // Gunakan sendStatus untuk OPTIONS
  }

  next();
});

// Middleware lainnya
app.use(bodyParser.json()); // Untuk parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // Untuk parsing application/x-www-form-urlencoded

// Middleware untuk menyajikan file statis dari folder 'uploads' dan 'backups'
// Folder 'uploads' untuk file restore yang diupload user
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Folder 'backups' tidak perlu disajikan secara statis karena file akan didownload melalui controller

// Panggil Swagger docs (biasanya diletakkan sebelum rute API)
swaggerDocs(app);

// Routes
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/stats", statsRoutes); // Endpoint akan menjadi /api/stats/*

// <<==== GUNAKAN RUTE ADMINISTRASI DATABASE BARU ====>>
// Prefix /api/admin/db akan membuat endpoint menjadi /api/admin/db/backup dan /api/admin/db/restore
app.use("/api/admin/db", dbAdminRoutes);

// Fungsi untuk koneksi MongoDB
const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI tidak terdefinisi di file .env");
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

// Test route
app.get("/", (req, res) => {
  res.send("Backend Marketplace IWAK is running!");
});

// Error handling middleware (letakkan di paling akhir setelah semua rute)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err);
  res.status(err.status || 500).json({
    message: err.message || "Terjadi kesalahan pada server.",
    // error: process.env.NODE_ENV === 'development' ? err : {} // Hanya tampilkan detail error di development
  });
});

// Ekspor app untuk testing
module.exports = app;

// Jalankan server hanya jika file ini dijalankan langsung (bukan saat testing)
if (require.main === module) {
  connectDB()
    .then(() => {
      // Pastikan DB terkoneksi sebelum server listen
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        // console.log(
        //   `Direktori untuk backup sementara: ${path.join(__dirname, "backups")}`
        // );
        // console.log(
        //   `Direktori untuk upload restore: ${path.join(__dirname, "uploads")}`
        // );
      });
    })
    .catch((err) => {
      console.error("Gagal memulai server:", err);
    });
}
