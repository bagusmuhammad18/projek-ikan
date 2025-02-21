const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
  },
  shippingAddress: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: [
      "Pending", // Order baru dibuat, belum dibayar
      "Paid", // Simulasi status 'sudah dibayar'
      "Processing", // Penjual sedang memproses pesanan
      "Shipped", // Pesanan dalam pengiriman
      "Delivered", // Pesanan sudah diterima pembeli
      "Cancelled", // Pesanan dibatalkan
    ],
    default: "Pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Order", orderSchema);
