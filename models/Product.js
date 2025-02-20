const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  size: {
    type: String,
    required: true,
    enum: ["S", "M", "L", "XL"],
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
    required: false,
  },
  discount: {
    type: Number,
    default: 0,
  },
  weight: {
    type: Number,
  },
  dimensions: {
    height: { type: Number },
    length: { type: Number },
    width: { type: Number },
  },
  type: {
    color: { type: [String] },
    size: { type: [String] },
  },
  isPublished: {
    type: Boolean,
    default: false, // Secara default, produk belum dipublikasikan
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
