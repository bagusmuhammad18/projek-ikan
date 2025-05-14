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

// Import Swagger setup
const swaggerDocs = require("./docs/swagger");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware untuk CORS dinamis
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:5173",
    "https://iwak-seven.vercel.app",
    "https://iwak.onrender.com",
    "https://siphiko.vercel.app",
  ];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Middleware lainnya
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Panggil Swagger docs
swaggerDocs(app);

// Routes
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

// Fungsi untuk koneksi MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  }
};

// Test route
app.get("/", (req, res) => {
  res.send("Backend Marketplace is running!");
});

// Ekspor app untuk testing
module.exports = app;

// Jalankan server hanya jika file ini dijalankan langsung (bukan saat testing)
if (require.main === module) {
  connectDB();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
