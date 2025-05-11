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
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  images: {
    type: [String],
    required: false,
  },
  weight: {
    type: Number,
    required: false,
  },
  dimensions: {
    height: { type: Number },
    length: { type: Number },
  },
  type: {
    jenis: { type: [String] },
    size: { type: [String] },
  },
  stocks: [
    {
      jenis: { type: String, required: true },
      size: { type: String, required: true },
      stock: { type: Number, required: true, min: 0 },
      price: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0, max: 100 },
    },
  ],
  price: {
    type: Number,
    required: false,
  },
  discount: {
    type: Number,
    required: false,
  },
  stock: {
    type: Number,
    required: false,
  },
  isPublished: {
    type: Boolean,
    default: true,
  },
  sales: { type: Number, default: 0 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
