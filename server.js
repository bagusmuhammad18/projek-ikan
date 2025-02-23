// server.js
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

// Import routes
const productRoutes = require("./routes/productRoutes");
const userRoutes = require("./routes/userRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy untuk platform seperti Vercel/Render
app.set("trust proxy", 1);

// Middleware untuk CORS
const allowedOrigins = [
  "http://localhost:5173",
  "https://iwak-seven.vercel.app",
  "https://iwak.onrender.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origin tidak diizinkan oleh CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Middleware untuk body parsing
app.use(bodyParser.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Log headers untuk debugging
app.use((req, res, next) => {
  console.log("Headers yang diterima:", req.headers);
  next();
});

// Test route
app.get("/", (req, res) => {
  res.send("Backend Marketplace is running!");
});

// Routes
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

// Koneksi ke MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    console.log("JWT_SECRET:", process.env.JWT_SECRET ? "Loaded" : "Not found");
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
