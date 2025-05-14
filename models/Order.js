// models/Order.js
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
  discount: {
    type: Number,
    default: 0,
  },
  discountedPrice: {
    type: Number,
    required: true,
  },
  size: {
    type: String,
    required: true,
    default: "default",
  },
  jenis: {
    type: String,
    required: true,
    default: "default",
  },
  color: {
    type: String,
    required: true,
    default: "default",
  },
});

const shippingAddressSchema = new mongoose.Schema({
  recipientName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  streetAddress: { type: String, required: true },
  city: { type: String, required: true },
  province: { type: String, required: true },
  postalCode: { type: String, required: true },
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
    type: shippingAddressSchema,
    required: true,
  },
  shippingCost: {
    type: Number,
    default: 0,
  },
  paymentMethod: {
    type: String,
    enum: ["bank_jateng", "cod", "qris"],
    required: true,
  },
  status: {
    type: String,
    enum: [
      "Pending",
      "Paid",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
    ],
    default: "Pending",
  },
  trackingNumber: {
    type: String,
    default: null,
  },
  codProof: { type: String, default: null }, // Field untuk bukti COD
  createdAt: {
    type: Date,
    default: Date.now,
  },
  proofOfPayment: { type: String, default: null },
});

module.exports = mongoose.model("Order", orderSchema);
