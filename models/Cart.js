const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  jenis: {
    type: String,
    required: [true, "Jenis is required"],
    trim: true,
  },
  size: {
    type: String,
    required: [true, "Size is required"],
    trim: true,
  },
  color: {
    type: String,
    required: false,
    default: null,
  },
});

// Middleware untuk memperbaiki item lama dengan 'color'
cartItemSchema.pre("validate", function (next) {
  if (this.color && !this.jenis) {
    this.jenis = this.color;
    this.color = null;
  }
  next();
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  items: [cartItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware untuk logging cart sebelum disimpan
cartSchema.pre("save", function (next) {
  next();
});

module.exports = mongoose.model("Cart", cartSchema);
