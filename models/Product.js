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
    default: 0, // Default discount 0 jika tidak diberikan
  },
  weight: {
    type: Number,
    // Contoh: 1.2 (dalam satuan kilogram, misalnya)
  },
  dimensions: {
    height: { type: Number }, // Contoh: 10
    length: { type: Number }, // Contoh: 30
    width: { type: Number }, // Contoh: 10
  },
  type: {
    color: {
      type: [String],
      // Contoh: ['Merah', 'hitam']
    },
    size: {
      type: [String],
      // Contoh: ['S', 'M', 'L']
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
